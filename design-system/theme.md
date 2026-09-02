The website’s theme is best described as **“civic transport utility”**: trustworthy, practical, data-focused, and distinctly New Zealand. It combines a custom NZTA-branded homepage with standard ArcGIS interface components on the [catalogue](https://opendata-nzta.opendata.arcgis.com/search?collection=dataset) and [dataset pages](https://opendata-nzta.opendata.arcgis.com/datasets/8d684f1841fa4dbea6afaefc8a1ba0fc_0/explore).

For your design system, I would use the NZTA homepage as the visual foundation, then modernise and standardise the ArcGIS components.

## 1. Design direction

**Personality**

* Authoritative but approachable
* Practical rather than decorative
* Public-service and research oriented
* Strong connection to roads, transport and place
* Data-dense without feeling overly technical
* Square, structured and restrained

A suitable design-theme description would be:

> A clean, trustworthy public-sector interface inspired by New Zealand’s transport network. Deep blue provides authority and stability, lime introduces energy and movement, and spacious white layouts keep maps, data and decisions at the centre of the experience.

## 2. Colour system

These colours were extracted from the rendered [NZTA Open Data portal](https://opendata-nzta.opendata.arcgis.com/).

| Token            |    Colour | Recommended use                                    |
| ---------------- | --------: | -------------------------------------------------- |
| `brand-navy`     | `#004771` | Header, navigation, feature panels, major headings |
| `brand-lime`     | `#AFBD22` | Transport icons, highlights, active categories     |
| `action-blue`    | `#0079C1` | Primary buttons, focus states, selected controls   |
| `link-blue`      | `#236FA6` | Text links and secondary actions                   |
| `brand-cyan`     | `#3EB1C8` | Optional secondary brand accent                    |
| `text-primary`   | `#4F4949` | Standard body text                                 |
| `text-secondary` | `#4C4C4C` | Metadata and supporting copy                       |
| `surface-page`   | `#F8F8F8` | Main page background                               |
| `surface-muted`  | `#F2F4F7` | Footer, filter groups, secondary sections          |
| `surface-subtle` | `#EFEFEF` | Skeleton loading and disabled areas                |
| `border-default` | `#CACACA` | Cards, inputs and dividers                         |
| `border-input`   | `#949494` | Form-field borders                                 |
| `white`          | `#FFFFFF` | Cards and reversed text                            |

Important accessibility note: `#AFBD22` has only about **2.07:1 contrast on white**. Use it for large icons, decorative highlights and thick indicators—not small text. Navy on white has approximately **9.81:1**, while action blue on white has approximately **4.66:1**.

## 3. Typography

The portal primarily renders **Open Sans**, with **Avenir Next** used as a fallback or within some ArcGIS components.

Recommended stack:

```css
font-family: "Open Sans", "Avenir Next", Avenir, "Helvetica Neue", Arial, sans-serif;
```

The existing portal’s typography varies between its homepage and ArcGIS pages. I would standardise it:

| Style             | Size / line-height | Weight |
| ----------------- | ------------------ | -----: |
| Display           | `36px / 44px`      |    600 |
| Page heading      | `32px / 40px`      |    600 |
| Section heading   | `24px / 32px`      |    600 |
| Component heading | `20px / 28px`      |    600 |
| Body large        | `18px / 28px`      |    400 |
| Body              | `16px / 24px`      |    400 |
| Small/metadata    | `14px / 20px`      |    400 |
| Label             | `12px / 16px`      |    600 |

Use sentence case throughout. Avoid heavy all-caps headings, apart from short badges such as “OPEN DATA”.

## 4. Layout

The homepage uses a traditional government-site container:

* Maximum content width: approximately `1170px`
* Desktop side margins: approximately `90px`
* Standard gutters: `24–30px`
* Header height: `80px`
* Hero/banner height: approximately `130px`
* Search input height: `44px`
* Footer background: pale blue-grey
* Square corners throughout

Use an **8px spacing system**:

```text
4, 8, 12, 16, 24, 32, 48, 64, 80
```

Recommended page patterns:

* Homepage: full-width header → photographic banner → search → two-column introduction → four category links.
* Catalogue: approximately `280–300px` filter sidebar with flexible results column.
* Dataset/application: information panel beside a map, table or primary workspace.
* Dashboard: control/filter bar above the map, with results in a side panel or bottom drawer.

## 5. Core components

### Header

* Deep navy background
* White NZTA logo on the left
* Separate white “OPEN DATA” label or product name
* Minimal navigation
* Avoid shadows
* Keep the header visually solid and institutional

Follow NZTA’s rules before directly reproducing the agency logo; NZTA provides separate [name and logo guidance](https://www.nzta.govt.nz/about-us/news-and-media/using-our-name-and-logo).

### Hero banner

The homepage is configured with a wide road/infrastructure photograph and an approximately 30% black overlay.

Use:

* Roads, infrastructure, landscapes or people interacting with transport
* Wide cinematic crops
* Muted photography
* Dark overlay when text appears over the image
* No illustration/photo collages

### Search

* Large, square input
* `44–48px` height
* Search icon on the left
* Grey border
* White or very light-grey background
* Strong blue focus treatment
* Place it prominently rather than hiding it in navigation

### Information panel

The homepage uses a navy feature panel with white text and underlined links.

Recommended styling:

```css
background: #004771;
color: #ffffff;
padding: 32px;
border-radius: 0;
```

Use these panels for instructions, explanations or “How this works” content.

### Category links

The homepage uses four icon-first categories: Roads, Vehicles, Crashes and Traffic.

Characteristics:

* Large lime transport pictogram
* Bold underlined label
* Generous white space
* No enclosing card or shadow
* Four columns on desktop
* Two columns on tablet and one column on narrow mobile

### Dataset cards

Catalogue results should use:

* White or `#F8F8F8` surface
* `1px solid #CACACA` border
* No shadow
* Underlined blue title
* Short description
* Compact metadata grid
* Clear labels for type, date updated and tags
* Optional small dataset/map icon

### Buttons

Primary:

```css
background: #0079C1;
color: #ffffff;
border: 1px solid #0079C1;
border-radius: 0;
```

Secondary:

```css
background: transparent;
color: #0079C1;
border: 1px solid #0079C1;
border-radius: 0;
```

Use a minimum height of `40–44px`. Hover states should darken the blue rather than introduce shadows or animation.

## 6. Iconography

Use simple, recognisable pictograms:

* Roads and lanes
* Vehicles
* Crash/safety symbols
* Traffic
* Maps and layers
* Tables and datasets
* Download and export

Icons should be geometric, single-colour and legible at a glance. Use lime for large category illustrations and blue or dark grey for functional interface icons.

Avoid gradients, detailed illustrations, emoji and mixed icon families.

## 7. Interaction and state design

* Keep text links underlined—the current portal does this well.
* Use a visible `2–3px` blue keyboard focus outline.
* Use pale-grey skeleton rows while loading.
* Show errors in a bordered alert with a red accent rather than relying only on colour.
* Pair every map with a table or list alternative.
* Use clear selected states for filters and simulation controls.
* Keep hover animation subtle: `120–180ms`.
* Do not use floating glass panels, blur effects or large shadows.

## 8. Responsive behaviour

For a modern implementation:

* Below `1024px`: narrow the sidebar and reduce outer margins.
* Below `768px`: stack introductory columns and convert filters to a drawer.
* Below `640px`: show category links as a vertical list or two-column grid.
* On map pages: turn the fixed information sidebar into a collapsible bottom sheet.
* Keep all touch controls at least `44 × 44px`.

## Starter tokens

```css
:root {
  --color-brand-navy: #004771;
  --color-brand-lime: #afbd22;
  --color-action: #0079c1;
  --color-action-hover: #00619b;
  --color-link: #236fa6;

  --color-text: #4f4949;
  --color-text-secondary: #4c4c4c;
  --color-background: #f8f8f8;
  --color-surface: #ffffff;
  --color-surface-muted: #f2f4f7;
  --color-border: #cacaca;
  --color-border-input: #949494;

  --font-sans:
    "Open Sans", "Avenir Next", Avenir,
    "Helvetica Neue", Arial, sans-serif;

  --radius-none: 0;
  --radius-small: 2px;

  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-6: 24px;
  --space-8: 32px;
  --space-12: 48px;
  --space-16: 64px;

  --content-width: 1170px;
  --control-height: 44px;
}
```

The main design decision is to treat the portal as **NZTA branding layered over an ArcGIS product**. Preserve the navy, lime, transport imagery, typography and square geometry, but standardise the inconsistent headings, buttons and link colours inherited from different ArcGIS templates.
