# Project 9: L'Oréal Routine Builder
L’Oréal is expanding what’s possible with AI, and now your chatbot is getting smarter. This week, you’ll upgrade it into a product-aware routine builder. 

Users will be able to browse real L’Oréal brand products, select the ones they want, and generate a personalized routine using AI. They can also ask follow-up questions about their routine—just like chatting with a real advisor.

## Live site

- GitHub Pages: https://ibraheem-05.github.io/09-prj-loreal-routine-builder/
- Cloudflare Worker (site + chat API): https://09-prj-loreal-routine-builder.hq3717.workers.dev

## What it does

- Browse products by category and **search** them by name or keyword (both filters work together).
- Click a card to select or unselect it; use **View details** to read the description.
- Selected products are saved in `localStorage`, so they stay after a reload. Remove one with the ✕ button or use **Clear all**.
- **Generate Routine** sends only the selected products to the Worker, and the reply appears in the chat. Follow-up questions keep the full conversation history.
- Colors use L'Oréal red `#ff003b` and gold `#e3a535`.

## LevelUps

- **Web search:** the Worker asks OpenAI to search the web and puts the links it found under the answer as "Sources". If search is not available, it falls back to a normal answer so the chat never breaks.
- **Product search:** the search box above the product grid.
- **RTL support:** the language switch (English / العربية) sets `dir="rtl"` and translates the page. The grid, selected list and chat flip, and the AI answers in Arabic.

## How it is built

- `index.html`, `style.css`, `script.js`: the page.
- `worker.js`: the Cloudflare Worker. It serves the site files and answers `POST` chat requests by calling OpenAI.
- `wrangler.jsonc`: Worker settings. Cloudflare redeploys automatically when `main` is pushed.

**The OpenAI key is never in this repo.** It is stored as the encrypted Worker secret `OPENAI_API_KEY`
(`npx wrangler secret put OPENAI_API_KEY`).
