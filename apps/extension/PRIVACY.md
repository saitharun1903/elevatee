# Elevate extension: privacy

**What it reads.** Elevate reads a web page only after you click the Elevate toolbar icon on that page. Nothing runs in the background, and the extension has no content scripts. It doesn't watch your browsing, your tabs or your navigation history.

**What happens on the click.** The side panel reads the current page once and builds a local preview (title, company, location). Nothing leaves your browser at this step.

**What it sends.** When you click **Analyze This Job**, Elevate sends that one page to your Elevate account at the configured Elevate address. It sends:
- the page URL and title
- the page HTML, with scripts (except structured job data), styles, images, media, iframes, form fields and comments removed, capped at 2.5 MB
- any text you selected, capped at 60,000 characters

That's all it sends. It does not send cookies, form values, browsing history or other tabs.

**What it stores.**
- `chrome.storage.local` holds your own Elevate session (access token, refresh token, expiry and email). The Elevate website gives it to the extension when you click Connect. It is sent only to Elevate, and Sign out removes it.
- `chrome.storage.session` holds, in memory, the IDs of the tabs where you clicked the icon, so the panel knows which tabs it may read. The browser clears it when it closes.

**Error reports.** These are optional and off unless the build sets a Sentry DSN. A report contains the error message and stack only. URLs have their query strings removed, and tokens are redacted. Reports never include page content, selections or tokens.

**No third parties.** The extension contains no analytics, ads or trackers, and it loads no remote code or fonts.
