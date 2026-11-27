# Final Form — rival voice lines (archived)

All rival lines were switched off on 27 Nov 2026. They are kept here so they can be restored.
To bring them back, paste the lists into `FOE_LINES` and `COUNTER_LINES` in `index.html`
(and `FOE_LINES_SI` in `si-preview.html` for the Silver Instinct cutscene).

## Entrance lines (`FOE_LINES`): said when a rival steps in

```js
const FOE_LINES = {
  oni: ["Oh? You're approaching me?", "Don't use such strong words. It makes you look weak.", 'You weak, pathetic fool!', 'Feel pain.', 'Oh… it\'s you.', 'You lack hatred.', 'War. War never changes.', 'Kept you waiting, huh?'],
  warden: ['Wake up to reality!', "Stand proud. You're strong.", "This isn't even my final form.", 'Is this all you\'ve got?', 'Hey, you. You\'re finally awake.', 'Know your place, fool.'],
  hollow: ['YLLACOFM'] };
```

| # | Rival | Line |
|---|---|---|
| 1 | Oni Brute | Oh? You're approaching me? |
| 2 | Oni Brute | Don't use such strong words. It makes you look weak. |
| 3 | Oni Brute | You weak, pathetic fool! |
| 4 | Oni Brute | Feel pain. |
| 5 | Oni Brute | Oh… it's you. |
| 6 | Oni Brute | You lack hatred. |
| 7 | Oni Brute | War. War never changes. |
| 8 | Oni Brute | Kept you waiting, huh? |
| 9 | Iron Warden | Wake up to reality! |
| 10 | Iron Warden | Stand proud. You're strong. |
| 11 | Iron Warden | This isn't even my final form. |
| 12 | Iron Warden | Is this all you've got? |
| 13 | Iron Warden | Hey, you. You're finally awake. |
| 14 | Iron Warden | Know your place, fool. |
| 15 | The Hollow | YLLACOFM |

## Counter taunts (`COUNTER_LINES`): said when a rival hits back after a Common or Uncommon answer

```js
const COUNTER_LINES = {
  oni: ["You'll have to do better than that.", 'That tickled.', 'Is that all you brought?'],
  warden: ["You'll have to do better than that.", 'Predictable.', 'Common steel bends. Mine does not.'],
  hollow: ["You'll have to do better than that.", 'Weak.', 'YLLACOFM'],
};
```

| # | Rival | Line |
|---|---|---|
| 16 | Oni Brute | You'll have to do better than that. |
| 17 | Oni Brute | That tickled. |
| 18 | Oni Brute | Is that all you brought? |
| 19 | Iron Warden | You'll have to do better than that. |
| 20 | Iron Warden | Predictable. |
| 21 | Iron Warden | Common steel bends. Mine does not. |
| 22 | The Hollow | You'll have to do better than that. |
| 23 | The Hollow | Weak. |
| 24 | The Hollow | YLLACOFM |
