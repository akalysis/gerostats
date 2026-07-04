# Gerostats

Static Vercel site for `gerostats.co.uk`.

## Deploy

Create a Vercel project using this folder as the project root:

```text
/Users/andrew/Desktop/Maps/gerostats
```

There is no build command and no output directory.  Vercel can serve the static
HTML directly.  After deployment, attach the domain `gerostats.co.uk` in Vercel.

## Structure

- `/index.html` is the landing page.
- `/writing/` is the writing index.
- `/stories/metro-life-expectancy/` hosts the Metro data story.
- `/stories/hidden-week-care/` hosts the unpaid-care interactive map.
- The animation source folder contains the Hidden Week guided animation.
  Run `npm install` once in that folder, then `npm run render` to regenerate
  `/assets/stories/hidden-week-story.mp4`.
- `/about/` is the author page.

## MathJax

Pages that need formulas can include the MathJax config and script in the page
head.  Inline notation such as `\( r_i = d_i / n_i \)` and display equations
such as this are supported:

```tex
\[
  R = \sum_i w_i r_i
\]
```

## Adding a new post

Copy the structure from an existing writing or story page, update the metadata,
title and content, then add it to `/writing/index.html`, `/feed.xml` and
`/sitemap.xml`.
