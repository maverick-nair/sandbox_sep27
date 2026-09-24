'use strict';
const { createApp } = require('./app');
const port = Number(process.env.PORT || 8080);
const app = createApp();
app.server.listen(port, () => console.log(`AI PM Launchpad listening on :${port} (Claude ${require('./claude').enabled() ? 'on' : 'off: set ANTHROPIC_API_KEY'})`));
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { app.close(); process.exit(0); });
