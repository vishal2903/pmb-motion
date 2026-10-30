// Copy to config.js and fill in. config.js is not committed: it holds the live feed URL.
window.PMB_CONFIG = {
  feedUrl: "",            // Apps Script web app URL (Deploy > Web app > copy URL)
  refreshSeconds: 60,
  excludeLeads: [],       // Lead developer names whose rows are left out of the dashboard
  clientAliases: {},      // invoice-sheet spelling -> Tracker spelling, lower case
};
