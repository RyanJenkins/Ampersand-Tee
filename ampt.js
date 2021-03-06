;(function() {
  var bbcTags = {
    'img': null,
    'quote': null,
    'url': null,
    'i': null,
    'u': null,
    'b': null,
    's': null
  }

  function extend(o1, o2) {
    // Copies all of the properties on o2 but not o1 onto o1
    for (attr in o2) {
      if (o1[attr] === undefined)
        o1[attr] = o2[attr]
    }
  }

  function filter(list, f) {
    var newList = []

    for (var i=0; i<list.length; i++)
      if (f(list[i]))
        newList.push(list[i])

    return newList
  }

  var escapeChars = ['n', 'r', 't']
  function repr(s) {
    var code, ch
    for (var i=0; i<escapeChars.length; i++) {
      code = escapeChars[i]
      ch = eval('"\\' + code + '"')
      s = s.replace(new RegExp(ch, 'g'), "\\" + code)
    }

    return s
  }

  function reTrim(charClass, str) {
    /* Takes a string representing a RegEx character class and a string and
     * returns the string sans all leading and tailing series of that char
     * class */
    var posClass = '[' + charClass + ']*',
        negClass = '[^' + charClass + ']',
        regex = new RegExp(posClass + '(' + negClass + '.*'
                           + negClass + ')' + posClass)
    return (str.match(regex) || {1: null})[1]
  }

  function BBCNode(name, attrs, children) {
    this.name = name
    this.attrs = attrs || {}
    this.children = children || []
  }

  BBCNode.prototype = {
    addChild: function(child) {
      this.children.push(child)
    },
    toString: function() {
      var s = '[' + this.name

      for (attr in this.attrs)
        s += ' ' + attr + '=' + this.attrs[attr]

      s += ']'

      for (var i=0; i<this.children.length; i++) {
        s += this.children[i].toString()
      }

      s += '[/' + this.name  + ']'

      return s
    },
    toPrint: function() { return '[' + this.name + ']' },
    print: function(depth) {
      depth = depth || 0
      console.log((new Array(depth*2+1)).join(' ') + this.toPrint())

      for (var i=0; i<this.children.length; i++) {
        this.children[i].print(depth+1)
      }
    }
  }

  function RootNode() {
    this.children = []
    this.attrs = {}
    this.name = '#root'
  }

  RootNode.prototype = {
    toString: function() {
      var s = ''
      for (var i=0; i<this.children.length; i++)
        s += this.children[i].toString()

      return s
    },
    toPrint: function() { return this.name }
  }
  extend(RootNode.prototype, BBCNode.prototype)


  function TextNode(text) {
    this.text = text
    this.children = []
    this.attrs = []
    this.name = '#text'
  }
  TextNode.prototype = {
    toString: function() { return this.text },
    addChild: function() { throw "Can not add children to text nodes" },
    toPrint: function() { return '#text: "' + repr(this.text) + '"' }
  }
  extend(TextNode.prototype, BBCNode.prototype)


  function Parser(text, options) {
    /* Create a new parser object initialized with text and options, the
     * following options are recognized:
     *
     * - _validTags_ An object with string keys indicating valid tag names,
     *   values are ignored. You can use this option to extend the set of tags
     *   that will be parsed. Defaults to `ampt.bbcTags`.
     * - _strict_ If false tags don't need to be a mamber of `validTags` to be
     *   parsed. If true unrecognized tags will be treated as simple text.
     *   Setting this false can be useful when dealing with unknown pidgins.
     *   Defaults to true.
     */
    options = options || {}

    this.i = 0
    this.text = text
    this.strict = (options.strict===undefined)?true:options.strict
    this.validTags = options.validTags || bbcTags
  }
  Parser.prototype = {
    parse: function() {
      var root = new RootNode()

      while (!(this.i == this.text.length)) {
        root.addChild(this.parseNode())
      }

      return root
    },
    parseNode: function() {
      var tag = this.nextTag(true),
        node

      if (tag && tag.closer) {
        // Definitely an error state
        return this.parseText()
      }

      if (tag) {
        return this.parseBBCTag()
      } else {
        // Not really necessary since this call will never recurse
        return this.parseText()
      }
    },
    parseBBCTag: function() {
      var openTag = this.nextTag(),
          node = new BBCNode(openTag.name, openTag.attrs),
          possibleCloser

      while (this.i < this.text.length) {
        possibleCloser = this.nextTag(true)
        if (possibleCloser
            && possibleCloser.name == openTag.name
            && possibleCloser.closer) {
          this.nextTag() // just to advance `this.i`
          break
        }

        node.addChild(this.parseNode())
      }

      return node
    },
    parseText: function() {
      var start = this.i

      for (this.i++; this.i<this.text.length; this.i++) {
        if (this.nextTag(true)) break
      }
      return new TextNode(this.text.substr(start, this.i-start))
    },
    nextTag: function(noAdvance) {
      /* Attempts to parse the next BBC opener tag and returns an object with
       * `name` and `attrs` keys if the next string from this.i is valid. If
       * it's not then return null and do not advance this.i. If noAdvance is
       * true then this.i will not be advanced even if we parse a tag. */
      var start = this.i,
          tag = {name: null, attrs: {}},
          attrStart = -1,
          quoteBalanced = true,
          i

      var addAttr = function(newAttrStart) {
        newAttrStart = newAttrStart || this.prevMatch(/[ \n]/, i, true) + 1
        if (attrStart != -1) {
          // We were in an attr before, so cap that one off first
          var kvString = this.text.substr(attrStart, newAttrStart-attrStart),
              kAndV = kvString.split('='),
              k, v

          k = reTrim(' \n "', kAndV[0])
          v = reTrim(' \n "', kAndV.slice(1).join('='))

          tag.attrs[k] = v
        }

        attrStart = newAttrStart
      }

      if (this.text[start++] != '[')
        return null

      if (this.text[start] == '/') {
        tag.closer = true
        start++
      }


      for (i=start; i<this.text.length; i++) {
        // Are we at the end of the tag name?
        if (this.text[i].match(/\W/) && !tag.name) {
          tag.name = this.text.substr(start, i-start)

          if (this.strict && !(tag.name in this.validTags))
            return null
        }

        if (this.text[i] == '"')
          quoteBalanced = !quoteBalanced

        // Are we at the end of a attr value?
        if (this.text[i] == '=' && quoteBalanced) {
          addAttr.call(this)
        }

        // Have we finished the tag?
        if (this.text[i] == ']') {
          if (!noAdvance) this.i = i+1

          // If we were in an attr string and have rached the end of the tag,
          // we insert in into the tag.attrs object.
          addAttr.call(this, i)

          return tag
        }
      }

      return null
    },
    prevMatch: function(regxp, i, qb) {
      var i = (i === undefined)?this.i:i,
          qb = (qb === undefined)?false:true,
          balanced = true

      for (; i>=0; i--) {
        if (this.text[i] == '"')
          balanced = !balanced

        if (this.text[i].match(regxp) && balanced)
          return i
      }

      return null
    },
  }

  ampt = {
    Parser: Parser,
    bbcTags: bbcTags,
    parse: function(text) {
      return (new Parser(text)).parse()
    },
    denestTags: function(tree, tagname, maxdepth) {
      maxdepth = maxdepth || 1

      var depth = 0;
      ;(function next(node) {
        if (node.name == tagname) 
          depth++

        if (depth >= maxdepth) {
            node.children = filter(node.children, function(x) {
              return x.name != tagname
            })
        }

        for (var i=0; i<node.children.length; i++)
          next(node.children[i])

        if (node.name == tagname) 
          depth--

      })(tree)

    }
  }

  if (typeof module !== 'undefined')
    module.exports = ampt
  else if (typeof window !== 'undefined')
    window.ampt = ampt
  else
    throw "Lol, where the hell am I?"
})()
