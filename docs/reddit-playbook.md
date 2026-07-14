# Mise Reddit Playbook

> **Strategy:** Provide genuine value first. The product mention is secondary. Follow the 9:1 rule: nine helpful comments/posts for every one that mentions Mise. Track grocery checkout conversions per subreddit, not just traffic. Use UTM parameters on all links.
>
> **Pre-conditions met:** Instacart production key (live), Impact affiliate (active), PostHog funnels (deployed).
>
> **YouTube note:** For YouTube recipes, extract via the Mise Chrome extension — it reads the captions in-page, which is more reliable than the web app's server-side YouTube path.

---

## Playbook 1: Reactive Recipe Comments

**Where:** r/recipes, r/Cooking, r/EatCheapAndHealthy, r/MealPrepSunday, r/cookingforbeginners, r/slowcooking, r/budgetfood

**When:** Someone posts a recipe or links to a cluttered recipe blog.

**How:**
1. See recipe post with a blog URL or inline recipe
2. Paste the source URL into Mise, extract it
3. Hit Share, copy the link
4. Comment with the clean link

**Template:**

```
Recipe without the ads: [mise share link with UTM]

(I built this tool — it strips recipe sites down to just the recipe. Free, no account needed.)
```

**Short version (when self-promo is risky):**

```
Here's a clean version without the life story and pop-ups: [mise share link]
```

**Why this works:** Mise's share URLs encode the full recipe in the URL (gzip + base64url). No database needed. You can generate a clean link for any recipe on the internet in seconds. Distill and similar tools need to store every recipe server-side — you don't.

**Rules:**
- Don't spam every recipe post. Pick ones with cluttered source URLs where the value is obvious.
- Don't mention Mise by name every time. Let people click through and discover it.
- Alternate between mentioning you built it and just dropping the link.
- Use UTM: `?utm_source=reddit&utm_medium=comment&utm_campaign=recipes`

---

## Playbook 2: The Workflow Post (Meal Planning)

**Where:** r/MealPrepSunday, r/EatCheapAndHealthy, r/mealprep, r/MealPlanning

**Angle:** Show the full Sunday meal prep workflow — plan, list, shop in one pass.

### Title

Sunday meal prep: I plan 5 meals, generate one grocery list, and send it to Instacart in about 2 minutes

### Body

```
Every Sunday I do the same thing:

1. Pick 5 recipes for the week (mix of saved favorites and new ones)
2. Drop them into a weekly meal planner
3. Hit "Grocery List" — it combines all the ingredients, merges duplicates, groups by category
4. Send the whole list to Instacart in one tap

The key is the aggregation. When 3 recipes need chicken thighs, it combines them into one line instead of three separate entries. Same with onions, garlic, rice — you see the overlap and buy less.

I built the tool that does this — it's called Mise. Free, works on any device, no account needed. The grocery list and Instacart flow are completely free.

https://mise.swinch.dev?utm_source=reddit&utm_medium=post&utm_campaign=mealprepsunday

Happy to answer questions about how it works.
```

---

## Playbook 3: The Budget Post (Value-First)

**Where:** r/EatCheapAndHealthy, r/budgetfood

**Angle:** Lead with actual meal plan and costs. Mise links in comments only.

### Title

5 meals for under $30 — my weekly meal prep on a budget

### Body

```
I meal prep 5 dinners every Sunday. This week came out to ~$28 (2 servings each):

- Sheet pan chicken thighs with roasted broccoli & sweet potato — bone-in thighs were $5.49/pack
- Black bean & corn quesadillas — mostly pantry staples, beans were $0.89/can
- Egg fried rice — leftover rice, eggs, frozen peas, soy sauce
- Sausage & white bean soup — one pack of sausage ($3.49) stretches in soup
- Pasta aglio e olio with wilted spinach — garlic, olive oil, red pepper flakes, done

The biggest money saver is planning all 5 together instead of shopping per recipe. When 3 recipes need chicken thighs, you buy one big pack instead of three trips. Same with onions, garlic, rice — you see the overlap and buy less.

Recipes linked in comments.
```

### Comment (post immediately after)

```
Here are the recipes:

- [Sheet pan chicken thighs](mise share link with UTM)
- [Black bean quesadillas](mise share link with UTM)
- [Egg fried rice](mise share link with UTM)
- [Sausage & white bean soup](mise share link with UTM)
- [Pasta aglio e olio](mise share link with UTM)
```

> **Note:** Share links can now be generated directly — open a saved recipe and hit the Share button (it builds the full `mise.swinch.dev/?d=…` link and copies it to the clipboard). Generate the five links and paste them in before posting.

**Rules:**
- No self-promotion in the post body. Mise is never mentioned.
- People discover the app organically by clicking recipe links.
- Post from a genuine account with existing karma/participation.
- Follow r/EatCheapAndHealthy Rule 1: formatted recipes accessible via links.

---

## Playbook 4: The Builder Post (Dev-Focused)

**Where:** r/SideProject, r/webdev, r/reactjs, r/IndieHackers

**Angle:** Technical architecture, interesting engineering challenges, lessons learned.

### Title

I built a recipe app that extracts recipes from any URL, TikTok video, or cookbook photo — here's the architecture

### Body

```
My wife's recipe workflow was a mess — bookmarks, screenshots, tabs everywhere. I built Mise to fix it. Even if nobody else ever used it, it was worth it for our kitchen.

It's a PWA (React 19, Vite, TypeScript) that runs entirely in the browser with IndexedDB. No accounts, no database, works offline. The backend is just stateless Vercel serverless functions.

**Five extraction modes:**
- **URL** — Paste any recipe link. Client-side JSON-LD/microdata parsing with a CORS proxy. Headless browser fallback (Puppeteer) for bot-protected sites.
- **Video** — Paste a TikTok, YouTube Short, or Instagram Reel. Puppeteer captures the video, ffmpeg extracts audio, Whisper transcribes it, Qwen2.5-VL reads on-screen text from frame grids. Both signals get structured into a recipe.
- **Photo** — Snap a cookbook page. Tesseract.js OCR + Qwen2.5-VL vision extraction.
- **Describe** — Natural language to recipe via Qwen3-14B with SSE streaming. @-reference saved recipes for modifications ("@Chicken Pot Pie but vegetarian").
- **Text paste** — Paste raw recipe text, it gets structured automatically.

**Other stuff that shipped:**
- Cooking mode with auto-detected timers, read-aloud TTS, and screen wake lock
- Serving scaler with unit conversion (volume-to-tsp, weight-to-gram)
- Weekly meal planner → aggregated grocery list → one-tap Instacart checkout
- Share URLs that encode the full recipe in the query string (gzip + base64url), decoded at the edge for crawlers. Every share creates a crawlable SEO page with JSON-LD and OG tags — zero database.
- Ingredient parser with 172+ test fixtures
- Nearly 400 tests across 34 test files, plus a Playwright end-to-end smoke suite — including security tests for SSRF, XSS, and injection

**Business model:** Free to use, $4.99 one-time unlock for power features. Real revenue comes from Instacart affiliate (5% on grocery orders). A free user who shops weekly is worth more than the $4.99 payment.

https://mise.swinch.dev?utm_source=reddit&utm_medium=post&utm_campaign=sideproject

Stack: React 19, TypeScript, Vite, Vercel, Puppeteer, Whisper, Qwen2.5-VL, Qwen3-14B, Dexie.js, Workbox, Stripe, Instacart APIs, PostHog.

Happy to talk architecture or answer questions.
```

---

## Playbook 5: The Problem Post (Organic Discovery)

**Where:** r/cookingforbeginners, r/Cooking

**Angle:** Ask a genuine question or share a tip. Mention Mise only if asked.

### Title

How do you save recipes from TikTok without screenshotting every frame?

### Body

```
I keep finding great recipes on TikTok and Reels but there's no good way to save them. Screenshots lose the audio instructions, bookmarking means I'll never find them again, and most "recipe saver" apps only work with blog URLs.

Has anyone found a good workflow for this? I've been pasting the video links into a tool that transcribes the audio and reads the on-screen text, which works surprisingly well, but curious what others do.
```

**Rules:**
- Do NOT mention Mise in the post.
- If someone asks "what tool?", reply naturally: "I built one called Mise — mise.swinch.dev. It uses Whisper for the audio and a vision model to read the on-screen text."
- This is a long game. Build karma and be a real participant.

---

## Playbook 6: Competitor Thread Response

**Where:** r/SideProject, r/VibeCodingSaaS, r/SaaS, or anywhere someone posts a competing recipe app

**Angle:** Be a peer, be helpful, mention Mise naturally.

### Template

```
Cool project! [specific genuine compliment about their app].

A couple thoughts since you asked:

- [Constructive feedback relevant to their question]
- [Insight from your experience building in the same space]
- [Feature gap they should consider, ideally one Mise already has]

I'm building in the same space — Mise (mise.swinch.dev). [One sentence on what differentiates yours]. Would be cool to compare notes. Good luck with it!
```

**Rules:**
- Always lead with a genuine compliment.
- Give real, useful feedback — don't just shill.
- Mention Mise once, briefly. Don't list every feature.
- Don't trash their product.

---

## Playbook 7: Weekly Thread Responses

**Where:** Any "what are you building this week" or "show your project" thread

### Short format

```
Working on Mise (mise.swinch.dev) — a recipe app that extracts recipes from any URL, TikTok video, or cookbook photo. Plan your week, generate a grocery list, send it to Instacart in one tap. PWA, works offline, no account needed. This week I'm [current focus].
```

### Longer format (for showcase threads)

```
**Mise — Just the Recipe**

mise.swinch.dev

Paste any recipe URL and get a clean recipe card — no ads, no life stories, no pop-ups. Also extracts recipes from TikTok/Shorts videos, cookbook photos, or just describe what you want to cook.

- 5 extraction modes: URL, video, photo, text, natural language
- Cooking mode with step-by-step timers and hands-free read-aloud
- Save recipes locally, plan your week, auto-generate a grocery list
- Send ingredients to Instacart in one tap
- Works offline, no account needed (PWA)
- $4.99 one-time for power features, free tier covers most people

Stack: React 19, TypeScript, Vite, Vercel, Whisper + Qwen2.5-VL for video/photo extraction
```

---

## UTM Convention

All links should use UTM parameters for PostHog tracking:

```
?utm_source=reddit&utm_medium={post|comment}&utm_campaign={subreddit_name}
```

Examples:
- `?utm_source=reddit&utm_medium=post&utm_campaign=mealprepsunday`
- `?utm_source=reddit&utm_medium=comment&utm_campaign=recipes`
- `?utm_source=reddit&utm_medium=post&utm_campaign=sideproject`

---

## Scheduling Rules

- Don't post to multiple subreddits on the same day (Reddit flags cross-posting spam).
- Space posts 3-5 days apart minimum.
- Post between 8-10am EST on weekdays or Sunday evenings for meal prep subs.
- Build 2-4 weeks of genuine karma in target subs before any promotional post.
- Reactive comments (Playbook 1) can happen anytime — these are the most natural.
