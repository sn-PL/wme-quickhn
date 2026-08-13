# WME Quick HN (snPL fork)

**WME Quick HN (snPL fork)** is a userscript for the Waze Map Editor (WME) designed to speed up and simplify the addition and modification of House Numbers (HN). It offers intuitive keyboard shortcuts, automated next-number prediction, and sequential letter incrementing.

This project is an enhanced fork of the original script by *Vinkoy*, later maintained and extended by *DaveAcincy*, and further improved by *snPL*.

---

## Key Features

*   **Quick Sequential Insertion**: Add sequential house numbers at specified intervals using single-key shortcuts.
*   **Letter Suffix Support (A-Z)**: Quickly append or increment letter suffixes (e.g., `12` -> `12A`, `12A` -> `12B`) with a single key.
*   **Base Number Reversion**: Easily drop the alphabetical suffix and revert to the base number (e.g., `12B` -> `12`).
*   **Modern WME SDK Integration**: Full compatibility with the latest Waze Map Editor keyboard shortcuts and sidebar registration framework.
*   **Auto-Set Next HN**: Automatically updates the last house number based on the last moved HN (configurable in settings).
*   **Map Zoom Bindings**: Use numeric keys to quickly zoom the map (Z11-Z20) when no segment is selected.
*   **Sidebar Settings Panel**: A polished sidebar tab featuring a home icon, custom options, numbering direction toggles, and dynamic shortcut mapping previews.

---

## Keyboard Shortcuts

When in **Edit House Numbers** mode, you can use the following default hotkeys:

| Key | Action |
| :---: | --- |
| **`T`** | Insert next sequential house number (+1 or -1 depending on mode) |
| **`R`** | Insert every 2nd house number (+2 / -2) |
| **`E`** | Insert house number with custom interval |
| **`W`** | Append or increment suffix letter (A-Z) |
| **`Q`** | Drop suffix letter and revert to base number |
| **`1` to `0`** | Insert house number with intervals ±1 to ±10, or zoom to level 11-20 (if no segment is selected) |

*Tip: You can toggle the numbering direction between **Increment &uarr;** and **Decrement &darr;** via the button in the script's sidebar tab.*

---

## Settings Configuration

The sidebar settings tab (marked with a home icon 🏠) provides the following configuration options:
1.  **Auto set next HN on moved HN**: Enable/disable automatic next house number updates when moving existing house numbers.
2.  **Zoom Keys when no segment**: Enable/disable map zoom shortcuts (`1-0` -> Z11-Z20) when editing mode is inactive.
3.  **Custom interval (E)**: Define the custom step interval for the `E` key shortcut.
4.  **Mode Toggle**: Instantly switch numbering direction (Increment/Decrement).
5.  **Interactive Preview**: A live list of predicted numbers for each shortcut mapping, ensuring accuracy before insertion.

---

## Installation

To install this userscript:
1.  Install a userscript manager extension such as [Tampermonkey](https://www.tampermonkey.net/) or [Violentmonkey] in your web browser.
2.  Add the `WME-QuickHNs.js` file to your userscript manager.
3.  Open the Waze Map Editor (`https://www.waze.com/editor/` or `https://beta.waze.com/editor/`). The script will load automatically!

---

## Technical Details

*   **Editor**: Waze Map Editor (WME)
*   **Technology**: Waze Map Editor JavaScript SDK
*   **Dependencies**: Utilizes WME SDK Shortcuts & Sidebar modules natively loaded in WME.
