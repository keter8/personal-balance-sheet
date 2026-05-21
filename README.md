# Personal Balance Sheet

Local-first personal balance sheet PWA for monthly asset, liability, credit-limit, and net-worth tracking.

## How To Use

1. Update cash, bank balances, loan balances, and credit limits.
2. Use **更新股價** to refresh stock market values.
3. Select a monthly close month and click **建立月結**.
4. Export a JSON backup after monthly close.

This is not a daily expense tracker. Data is stored locally in the browser with IndexedDB. Do not commit exported backup JSON files because they contain personal financial data.

The app tracks the last export time locally and reminds you to back up after monthly close or when the last backup is more than 30 days old.

## Deploy With GitHub Pages

Repository settings:

- Source: Deploy from a branch
- Branch: `main`
- Folder: `/root`

Then open the GitHub Pages URL in iPhone Safari and choose **Add to Home Screen**.
