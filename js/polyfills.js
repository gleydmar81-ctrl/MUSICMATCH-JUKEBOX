(function () {
  if (!Array.from) {
    Array.from = function (value) {
      var result = [];
      if (value && typeof value.forEach === "function" && typeof value.length !== "number") {
        value.forEach(function (item) { result.push(item); });
      } else {
        for (var i = 0; value && i < value.length; i++) result.push(value[i]);
      }
      return result;
    };
  }

  if (!Array.prototype.fill) {
    Array.prototype.fill = function (value) {
      for (var i = 0; i < this.length; i++) this[i] = value;
      return this;
    };
  }

  if (!Array.prototype.find) {
    Array.prototype.find = function (callback, thisArg) {
      for (var i = 0; i < this.length; i++) {
        if (callback.call(thisArg, this[i], i, this)) return this[i];
      }
      return undefined;
    };
  }

  if (window.NodeList && !NodeList.prototype.forEach) {
    NodeList.prototype.forEach = Array.prototype.forEach;
  }

  if (!String.prototype.includes) {
    String.prototype.includes = function (search, start) {
      return this.indexOf(search, start || 0) !== -1;
    };
  }

  if (!String.prototype.startsWith) {
    String.prototype.startsWith = function (search, start) {
      return this.substr(start || 0, search.length) === search;
    };
  }

  if (!String.prototype.endsWith) {
    String.prototype.endsWith = function (search) {
      return this.slice(-search.length) === search;
    };
  }

  if (window.Element && !Element.prototype.closest) {
    Element.prototype.closest = function (selector) {
      var element = this;
      while (element && element.nodeType === 1) {
        if (element.matches(selector)) return element;
        element = element.parentElement;
      }
      return null;
    };
  }

  if (window.Blob && !Blob.prototype.arrayBuffer) {
    Blob.prototype.arrayBuffer = function () {
      var blob = this;
      return new Promise(function (resolve, reject) {
        var reader = new FileReader();
        reader.onload = function () { resolve(reader.result); };
        reader.onerror = function () { reject(reader.error); };
        reader.readAsArrayBuffer(blob);
      });
    };
  }

  if (!window.fetch && window.XMLHttpRequest) {
    window.fetch = function (input, options) {
      options = options || {};
      return new Promise(function (resolve, reject) {
        var request = new XMLHttpRequest();
        request.open(options.method || "GET", input, true);
        request.responseType = "arraybuffer";
        if (options.headers) {
          Object.keys(options.headers).forEach(function (name) {
            request.setRequestHeader(name, options.headers[name]);
          });
        }
        request.onload = function () {
          var body = request.response || new ArrayBuffer(0);
          function text() {
            var bytes = new Uint8Array(body);
            var binary = "";
            for (var i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
            try {
              return decodeURIComponent(escape(binary));
            } catch (error) {
              return binary;
            }
          }
          resolve({
            ok: request.status >= 200 && request.status < 300,
            status: request.status,
            arrayBuffer: function () { return Promise.resolve(body); },
            json: function () {
              return Promise.resolve().then(function () { return JSON.parse(text()); });
            }
          });
        };
        request.onerror = function () { reject(new TypeError("Falha na solicitação de rede.")); };
        request.send(options.body || null);
      });
    };
  }
})();
