# peer-to-pair
use one of these:
1. GitHub (easiest): push this folder to a GitHub repo, then Netlify > Add new site > Import from Git. Defaults from netlify.toml are picked up.
2. CLI: npm i -g netlify-cli, then netlify deploy --prod from this folder.

Then, in Netlify > Site configuration > Environment variables, add:
- P2P_SECRET  a long random string (signs login tokens). Required for real use.
- ANTHROPIC_API_KEY  optional; lets Mochi answer with Claude instead of the small offline helper.
- P2P_BOT_MODEL  optional model name.

## Try it locally (no Netlify account)
    npm run local        # http://localhost:8888, data in memory
    npm test             # API end-to-end test
