# Signature-writing animation

A realistic pen writes a connected, strongly slanted cursive signature using public-domain Hershey Script single-stroke data. The written baseline rises by 5 degrees. Letters have an additional right lean and close joins. The pen traces the actual visible SVG strokes; there are no font masks, filled letters, or end-of-animation fill. Animation time pauses in hidden tabs and advances by at most 32 ms per frame after a stall. The signature viewport fits the ink with minimal padding. Black ink, the current writing pace, the one-second signature hold, and the 1.8-second three-dot Processing loader remain. Payment contains only payment instructions. Consent and the full-name field remain mandatory. Incomplete writing cannot advance to Payment. If an animation asset fails, a visible retry message appears instead of completing the name automatically. Names are preserved exactly, including entered capitalization. Latin letters, common decomposable accents, punctuation and initials are supported. Unsupported scripts receive a clear validation message instead of simulated handwriting. Reduced-motion settings show the complete strokes without a flying pen.

## Assets and attribution

- Active handwriting: `dist/assets/signature-handwriting.json`, derived from the public-domain Script 1-stroke (alt) data in https://github.com/techninja/hersheytextjs.
- Active stroke-data attribution is retained in `dist/assets/SIGNATURE-FONT-LICENSE.txt`. Earlier unused fonts and stroke exports have been removed.
- Pen: `dist/assets/signing-pen.png`, generated with ImageGen in an earlier revision.
- Renderer: `dist/signature-animation.mjs`; layout: `dist/signature-layout.mjs`.

## Final pen prompt

Use case: product-mockup. Asset type: transparent realistic pen sprite for a website handwriting animation. One single uncapped luxury black fountain pen with a fine polished silver nib and subtle silver barrel details. Photorealistic studio product photograph, sharply defined material highlights, no hand, no paper, no surface, no cast shadow, no lettering, no logo. Entire pen visible with generous transparent padding and a genuinely transparent background. Portrait composition. The pen runs diagonally from the writing nib at the lower-left (approximately 14% from left, 90% from top) to the back end at upper-right (approximately 86% from left, 10% from top). Fine nib tip is clearly visible as the lowest-leftmost point of the actual pen; the pen is about six times longer than its width. Pen ready to write, nib points down-left, barrel tilts up-right. Real object photography, not a flat icon or illustration.
