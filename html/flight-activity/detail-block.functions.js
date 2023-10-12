let usp;
try {
  // let's make this case insensitive
  usp = {
    params: new URLSearchParams(),
    has: function (s) {
      return this.params.has(s.toLowerCase());
    },
    get: function (s) {
      return this.params.get(s.toLowerCase());
    },
    getFloat: function (s) {
      if (!this.params.has(s.toLowerCase())) return null;
      const param = this.params.get(s.toLowerCase());
      if (!param) return null;
      const val = parseFloat(param);
      if (isNaN(val)) return null;
      return val;
    },
    getInt: function (s) {
      if (!this.params.has(s.toLowerCase())) return null;
      const param = this.params.get(s.toLowerCase());
      if (!param) return null;
      const val = parseInt(param, 10);
      if (isNaN(val)) return null;
      return val;
    },
  };
  const inputParams = new URLSearchParams(window.location.search);
  for (const [k, v] of inputParams) {
    usp.params.append(k.toLowerCase(), v);
  }
} catch (error) {
  console.error(error);
  usp = {
    has: function () {
      return false;
    },
    get: function () {
      return null;
    },
  };
}

function SubscriberDataRedirect() {
  if (!returnCookie("adsbx_subscriber") || !returnCookie("adsbx_subscriber_exp")) { 
    window.location.href = "/index.html"
  }

}