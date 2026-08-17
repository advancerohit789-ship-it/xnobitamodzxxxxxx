# Railway Deployment

1. Upload this project to a GitHub repository.
2. Create a Railway project and deploy the repository.
3. Railway should run `npm start`.
4. Add your real secrets in Railway Variables, not in `.env` or GitHub.
5. Suggested variables:
   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_OWNER_ID`
   - `AUTO_PAIRING=false`
6. Redeploy after adding variables.

The included `Procfile` declares `web: npm start`, and `.nvmrc` requests Node.js 20.
