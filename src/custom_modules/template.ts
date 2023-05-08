/*
Copyright (C) 2013 Krasimir Tsonev, http://krasimirtsonev.com

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
*/

module.exports = function (html, options) {
  var re = /<%(.+?)%>/g,
    reExp = /(^( )?(var|if|for|else|switch|case|break|{|}|;))(.*)?/g,
    code = "with(obj) { var r=[];\n",
    cursor = 0,
    result,
    match;
  var add = function (line, js) {
    js
      ? (code += line.match(reExp) ? line + "\n" : "r.push(" + line + ");\n")
      : (code += line != "" ? 'r.push("' + line.replace(/"/g, '\\"') + '");\n' : "");
    return add;
  };
  while ((match = re.exec(html))) {
    (add as any)(html.slice(cursor, match.index))(match[1], true);
    cursor = match.index + match[0].length;
  }
  (add as any)(html.substr(cursor, html.length - cursor));
  code = (code + 'return r.join(""); }').replace(/[\r\t\n]/g, " ");
  try {
    result = new Function("obj", code).apply(options, [options]);
  } catch (err) {
    console.error("'" + err.message + "'", " in \n\nCode:\n", code, "\n");
  }
  return result;
};
