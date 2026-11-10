// Serves the game from dailybreak.app. Any other host (the old workers.dev address,
// www.dailybreak.app) gets a permanent redirect to the same path on dailybreak.app.
const HOST = 'dailybreak.app';
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.hostname !== HOST) {
      url.protocol = 'https:'; url.hostname = HOST; url.port = '';
      return Response.redirect(url.toString(), 301);
    }
    return env.ASSETS.fetch(request);
  },
};
