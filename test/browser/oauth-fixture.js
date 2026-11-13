// Generated media/fake meeting, optional ACTUAL pinned credentials/HTTP plugins.
// The integration secret and real refresh grant never enter this page.
window.testAuthOptions = null;
window.testCredentialReads = [];
const authOriginal = window.Webex;
window.Webex = { init(options) {
  window.testAuthOptions = JSON.parse(JSON.stringify(options)); // actual SDK mutates its input into live token objects
  const sdk = authOriginal.init(options);
  if (window.testActualFactory) {
    const actual = window.testActualFactory.init(options);
    window.testActualAuthSDK = actual;
    window.testCredentialRead = async () => String(await actual.credentials.getUserToken());
    const request = async options => {
      window.testCredentialReads.push(await window.testCredentialRead());
      return window.testChatRequest(options);
    };
    actual.rooms.request = request; actual.messages.request = request;
    sdk.credentials = actual.credentials; sdk.rooms = actual.rooms; sdk.messages = actual.messages;
    sdk.on = actual.on.bind(actual); sdk.off = actual.off.bind(actual);
    return sdk;
  }
  let token = options.credentials.access_token, pending;
  window.testCredentialRead = async () => `Bearer ${token}`;
  sdk.credentials = { getUserToken: async () => ({ toString: () => `Bearer ${token}` }), refresh() {
    return pending ??= options.config.credentials.refreshCallback().then(next => { token = next.access_token; })
      .finally(() => { pending = undefined; });
  } };
  return sdk;
} };
