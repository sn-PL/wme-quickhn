// ==UserScript==
// @name         WME Quick HN (snPL fork)
// @description  Quick House Numbers - Original Logic + Letter Increment (W) & Base Revert (Q)
// @version      2026.04.01.01
// @author       Vinkoy (forked by DaveAcincy, enhanced by snPL)
// @match        https://beta.waze.com/*editor*
// @match        https://www.waze.com/*editor*
// @exclude      https://www.waze.com/*user/*editor/*
// @exclude      https://www.waze.com/discuss/*
// @namespace    https://greasyfork.org/users/1571845-snpl
// @icon         https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.5.1/svgs/solid/house-flag.svg
// @updateURL    https://greasyfork.org/scripts/591169-wme-quick-hn-snpl-fork/code/WME%20Quick%20HN%20(snPL%20fork).meta.js
// @downloadURL  https://greasyfork.org/scripts/591169-wme-quick-hn-snpl-fork/code/WME%20Quick%20HN%20(snPL%20fork).user.js
// @grant        GM.addStyle
// ==/UserScript==

(function () {
    'use strict';

    const debug = false;

    const scriptName = 'Quick HN';
    const scriptId = 'wmeqhn';

    const _HN_LAYER_NAME = 'qhn-hn-lines';

    let policySafeHTML;
    let wazeMapObserver;
    let lastHN;
    let nextHNs;
    let nextHNLetter;
    let useLetterIncrement = false;
    let activeInterval = 1;
    let modeMultiplier = 1;
    let fillnext = false;
    let _hnDrawTimer;
    let _hnDrawPending = false;
    let _lastExtentStr;
    const initializedLayers = new Set();

    let { autoSetHN = true, zoomKeys = false, custom = 4, hnLines = true, disableBelowZoom = 17 } = JSON.parse(localStorage[scriptId] ?? '{}');


    custom = Number(custom) || 4;

    let wmeSDK;
    if (unsafeWindow.SDK_INITIALIZED) {
        unsafeWindow.SDK_INITIALIZED.then(() => {
            const getWmeSdk = unsafeWindow.getWmeSdk || window.getWmeSdk;
            wmeSDK = getWmeSdk({ scriptId, scriptName });
            wmeSDK.Events.once({ eventName: 'wme-ready' }).then( () => {
                initialiseQHN();
            });
        });
    }

    function transformTo4326From900913(x, y) {
        if (!Number.isFinite(Number(x)) || !Number.isFinite(Number(y))) return null;
        const R = 6378137.0;
        const lon = (x / R) * (180 / Math.PI);
        const lat = (2 * Math.atan(Math.exp(y / R)) - Math.PI / 2) * (180 / Math.PI);
        return { x: lon, y: lat };
    }

    function tlog(message, data = '') {
        if (!debug) return;

        const t = new Date();
        const h = t.getHours();
        const m = t.getMinutes();
        const s = t.getSeconds();
        const ms = `${t.getMilliseconds()}`.padStart(3, '0');

        console.log(`QHN: ${h}:${m}:${s}.${ms}: ${message}`, data);
    }

    function createShortcut(shortcutId, description, callback, shortcutKeys) {
        wmeSDK.Shortcuts.createShortcut({
            shortcutId,
            description,
            callback,
            shortcutKeys
        });
    }

    function saveQHNOptions() {
        localStorage[scriptId] = JSON.stringify({ autoSetHN, zoomKeys, custom, hnLines, disableBelowZoom });
    }

    function initialiseQHN() {
        if (typeof trustedTypes !== 'undefined') {
            policySafeHTML = trustedTypes.createPolicy('policySafeHTML', { createHTML: innerText => innerText });
        }


        createShortcut('WME_QHN_newHN01', "Insert next sequential house number", () => addOrZoom(1), 't');
        createShortcut('WME_QHN_newHN02', "Insert every 2nd house number", () => addOrZoom(2), 'r');
        createShortcut('WME_QHN_newHNcustom', "Insert house number with custom interval", () => addOrZoom(custom), 'e');


        createShortcut('WME_QHN_newHNLetter', "Append/Increment Letter (A-Z)", () => addOrZoomLetter(), 'w');
        createShortcut('WME_QHN_revertBase', "Drop Letter & Revert to Base Number", () => revertToBase(), 'q');

        for (let key = 1; key <= 10; key++) {
            createShortcut(`WME_QHN_newHN${key}`, `Insert house number ±${key}, or zoom to level ${key + 10}`, () => addOrZoom(key, key + 10), (key % 10).toString());
        }

        GM.addStyle('.qhn-panel { color: var(--content_p1); }');

        wmeSDK.Sidebar.registerScriptTab().then(({ tabLabel, tabPane }) => {
            tabLabel.id = scriptId;
            tabLabel.innerHTML = `<i class="fa fa-home" style="margin-right: 5px;"></i> ${scriptName}`;
            tabLabel.title = `${scriptName} Settings`;
            tabPane.innerHTML = ((text) => policySafeHTML ? policySafeHTML.createHTML(text) : text)(`
                <div class="qhn-panel"><div><b><i class="fa fa-home"></i> Quick House Numbers</b> v${GM_info.script.version}</div><br/>
                <div><input type='checkbox' id='qhnAutoSetHNCheckbox' name='qhnAutoSetHNCheckbox' title="When enabled, auto set next HN updates the last HN based on the last HN moved" ${autoSetHN ? 'checked' : ''}> <label for='qhnAutoSetHNCheckbox'><i class="fa fa-magic" style="margin-right: 3px;"></i> Auto set next HN on moved HN</label></div>
                <div><input type='checkbox' id='qhnZoomKeysCheckbox' name='qhnZoomKeysCheckbox' title="1-9 => Z11-19; 0 => Z20" ${zoomKeys ? 'checked' : ''}> <label for='qhnZoomKeysCheckbox'><i class="fa fa-search-plus" style="margin-right: 3px;"></i> Zoom Keys when no segment</label></div>
                <div><input type='checkbox' id='qhnLinesCheckbox' name='qhnLinesCheckbox' title="Show lines connecting house numbers to their segments" ${hnLines ? 'checked' : ''}> <label for='qhnLinesCheckbox'><i class="fa fa-link" style="margin-right: 3px;"></i> Show HN Lines</label></div>
                <div><i class="fa fa-list-ol" style="margin-right: 3px;"></i> Custom interval (E): <input type='number' id='qhnCustomInput' min='1' value='${custom}' style='width: 50px;'></div><br/>
                <div><i class="fa fa-sort" style="margin-right: 3px;"></i> Mode: <button name='qhnModeToggle' id='qhnModeToggle'>Increment &uarr;</button></div><br/>
                <div id="qhnTabPane"></div></div>`);

            document.querySelector('#qhnAutoSetHNCheckbox').addEventListener('change', (e) => {
                autoSetHN = e.target.checked;
                saveQHNOptions();
            });

            document.querySelector('#qhnZoomKeysCheckbox').addEventListener('change', (e) => {
                zoomKeys = e.target.checked;
                saveQHNOptions();
                updateTabPane();
            });

            document.querySelector('#qhnLinesCheckbox').addEventListener('change', (e) => {
                hnLines = e.target.checked;
                saveQHNOptions();
                if (hnLines) {
                    _lastExtentStr = null;
                    drawHNLines();
                }
                else destroyHNLines();
            });

            document.querySelector('#qhnCustomInput').addEventListener('change', (e) => {
                custom = Number(e.target.value) || 1;
                e.target.blur();
                saveQHNOptions();
                updateNextHNs();
            });

            document.querySelector('#qhnModeToggle').addEventListener('click', (e) => {
                modeMultiplier *= -1;
                e.target.innerHTML = (modeMultiplier > 0 ? 'Increment &uarr;' : 'Decrement &darr;');
                e.target.blur();
                updateNextHNs();
            });

            updateNextHNs();
        });


        wazeMapObserver = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                for (const node of mutation.addedNodes) {
                    if (node.className === 'house-number is-active') {
                        const hnInput = node.querySelector('input');
                        if (hnInput) hnInput.onfocus = () => setHN();
                    }
                }
            }
        });

        wmeSDK.Events.on({
            eventName: 'wme-selection-changed', eventHandler: () => {
                if (wmeSDK.Editing.getSelection()?.objectType === 'segment')
                    wazeMapObserver.observe(document.querySelector('#WazeMap'), { childList: true, subtree: true });
                else
                    wazeMapObserver.disconnect();
                updateTabPane();
            }
        });

        wmeSDK.Events.on({
            eventName: "wme-house-number-added",
            eventHandler: handleHNAdded
        });
        wmeSDK.Events.on({
            eventName: "wme-house-number-moved",
            eventHandler: handleHNMoved
        });

        initHNLinesLayer();

        const debouncedDraw = () => {
            clearTimeout(_hnDrawTimer);
            _hnDrawTimer = setTimeout(() => {
                drawHNLines();
            }, 300);
        };
        wmeSDK.Events.on({ eventName: 'wme-map-move-end', eventHandler: debouncedDraw });
        wmeSDK.Events.on({ eventName: 'wme-map-zoom-changed', eventHandler: debouncedDraw });

        console.log("Quick HN: initialize complete");
    }

    function handleHNAdded(e) {
        const hnid = e.houseNumberId;
        const hn = W.model?.segmentHouseNumbers?.getObjectById(hnid)?.attributes?.number;
        tlog('hn added event: ' + hn, e);
        lastHN = hn;
        updateNextHNs();
        setTimeout(displayQHNtab, 110);
    }

    function handleHNMoved(e) {
        const hnid = e.houseNumberId;
        const hn = W.model?.segmentHouseNumbers?.getObjectById(hnid)?.attributes?.number;
        if (autoSetHN) {
            tlog('hn moved event: ' + hn, e);
            lastHN = hn;
            updateNextHNs();
            setTimeout(displayQHNtab, 110);
        }
    }


    function addOrZoom(newInterval, zoom) {
        if (!newInterval) return;

        if (wmeSDK.Editing.getSelection()?.objectType == 'segment') {
            activeInterval = Number(newInterval);
            useLetterIncrement = false;
            fillnext = true;

            tlog('setFocus');
            updateTabPane();
            const addBtn = document.querySelector('wz-button:has(.w-icon-home)') || document.querySelector('.toolbar-button.add-house-number');
            if (addBtn) addBtn.click();
        }
        else if (zoomKeys && zoom) {
            wmeSDK.Map.setZoomLevel( { zoomLevel: zoom } );
        }
    }


    function addOrZoomLetter() {
        if (wmeSDK.Editing.getSelection()?.objectType == 'segment') {
            useLetterIncrement = true;
            fillnext = true;

            tlog('setFocus Letter');
            updateTabPane();
            const addBtn = document.querySelector('wz-button:has(.w-icon-home)') || document.querySelector('.toolbar-button.add-house-number');
            if (addBtn) addBtn.click();
        }
    }


    function revertToBase() {
        if (!lastHN) return;

        let strippedBase = lastHN.replace(/[- ]?[a-zA-Z]+$/, '');
        if (!strippedBase) strippedBase = '0';

        if (lastHN !== strippedBase) {
            tlog(`Reverting base from ${lastHN} to ${strippedBase}`);
            lastHN = strippedBase;
            updateNextHNs();
        }
    }

    async function displayQHNtab() {
        const scr = document.querySelector('#drawer > wz-navigation-item[data-for="userscript_tab"]');
        if (scr && scr.getAttribute('selected') == 'false') { scr.click(); }

        await new Promise(r => setTimeout(r, 50));
        const tab = document.querySelector(`#${scriptId}`);
        if (tab) tab.click();
    }


    async function setHN() {
        tlog('setHN');
        const hnInput = document.querySelector('div.house-number.is-active input:placeholder-shown');
        if (!fillnext || !hnInput) return;

        fillnext = false;


        let insertValue = nextHNs[activeInterval][0];
        if (useLetterIncrement) insertValue = nextHNLetter;


        useLetterIncrement = false;


        hnInput.value = insertValue;
        hnInput._valueTracker?.setValue("");
        hnInput.dispatchEvent(new Event("input", { bubbles: true }));

        await new Promise(r => setTimeout(r, 100));
        hnInput.blur();
    }


    function updateNextHNs() {
        nextHNs = {};
        let base = lastHN ?? '0';


        for (const currentInterval of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, custom]) {
            nextHNs[currentInterval] = new Array(3);
            let baseHN = base;

            for (let index = 0; index < nextHNs[currentInterval].length; index++) {
                const nextParts = baseHN.match(/[0-9]+|[a-z]|[A-Z]|\S/g);

                let thisInterval = currentInterval;
                for (const [partIndex, part] of nextParts.reverse().entries()) {
                    if (!Number.isNaN(Number(part))) {
                        nextParts[partIndex] = Math.max(1, Number(part) + (thisInterval * modeMultiplier)).toString().padStart(part.length, '0');
                        break;
                    }

                    if (/[a-z]/i.test(part)) {
                        let nextLetter = part.codePointAt(0) + ((thisInterval % 26) * modeMultiplier);
                        thisInterval = Math.floor(thisInterval / 26);

                        if ((/[a-z]/.test(part) && nextLetter > 'z'.codePointAt(0)) ||
                            (/[A-Z]/.test(part) && nextLetter > 'Z'.codePointAt(0))) {
                            nextLetter -= 26;
                            thisInterval++;
                        }

                        if ((/[a-z]/.test(part) && nextLetter < 'a'.codePointAt(0)) ||
                            (/[A-Z]/.test(part) && nextLetter < 'A'.codePointAt(0))) {
                            nextLetter += 26;
                            thisInterval++;
                        }

                        nextParts[partIndex] = String.fromCodePoint(nextLetter);

                        if (!thisInterval) break;
                    }
                }

                baseHN = nextParts.reverse().join('');
                nextHNs[currentInterval][index] = baseHN;
            }
        }


        if (/[a-zA-Z]$/.test(base)) {
            let lastChar = base.slice(-1);
            let charCode = lastChar.charCodeAt(0);

            if (modeMultiplier > 0) {
                if (charCode === 90) charCode = 65;
                else if (charCode === 122) charCode = 97;
                else charCode++;
            } else {
                if (charCode === 65 || charCode === 97) {
                    nextHNLetter = base.slice(0, -1);
                    charCode = null;
                } else {
                    charCode--;
                }
            }
            if (charCode !== null) nextHNLetter = base.slice(0, -1) + String.fromCharCode(charCode);
        } else {
            if (modeMultiplier > 0) nextHNLetter = base + 'A';
            else nextHNLetter = base;
        }

        updateTabPane();
    }

    function updateTabPane() {
        const pane = document.querySelector('#qhnTabPane');
        if (!pane) return;


        const mappings = [
            ['Q', 'revert'], ['W', 'letter'], ['T', 1], ['R', 2], ['E', custom],
            ...[...Array(10).keys()].map(key => [(key + 1) % 10, key + 1])
        ];

        const nextValue = useLetterIncrement ? nextHNLetter : (nextHNs[activeInterval]?.[0] ?? '');

        let html = "";
        if (lastHN) {
            html += `<div><i class="fa fa-tag" style="margin-right: 3px;"></i> Last house number: <b>${lastHN}</b></div>`;
            html += `<div><i class="fa fa-chevron-right" style="margin-right: 3px;"></i> Next house number: <b>${nextValue}</b></div><br/>`;
        } else {
            html += `<div><b>NOTE: Manually set a house number to start using Quick HN!</b></div><br/>`;
        }

        html += `<div><i class="fa fa-keyboard-o" style="margin-right: 3px;"></i> Press...`;
        html += mappings.reduce((list, [key, mappedInterval]) => {
            let text = "";

            if (mappedInterval === 'revert') {

                let stripped = (lastHN ?? '').replace(/[- ]?[a-zA-Z]+$/, '');
                if (lastHN && stripped === lastHN) return list;
                if (!stripped) stripped = '0';
                text = `to Drop Letter & Revert to Base <i>(${stripped})</i>`;
            }
            else if (mappedInterval === 'letter') {
                text = `for Letter Increment <i>(${nextHNLetter})</i>`;
            }
            else if (zoomKeys && Number.isInteger(key) && wmeSDK.Editing.getSelection()?.objectType !== 'segment') {
                text = `to zoom to level ${mappedInterval + 10}`;
            }
            else {
                const predictedValues = nextHNs[mappedInterval] ? nextHNs[mappedInterval].join(", ") : "";
                text = `for HN${modeMultiplier > 0 ? "+" : "-"}${mappedInterval} <i>(${predictedValues}...)</i>`;
            }
            return `${list}<br/><b>${key}</b> ${text}`;
        }, '');
        html += `</div>`;

        pane.innerHTML = html;
    }

    function initHNLinesLayer() {
        if (initializedLayers.has(_HN_LAYER_NAME)) return;
        try {
            wmeSDK.Map.addLayer({
                layerName: _HN_LAYER_NAME,
                styleContext: { getStrokeColor: ({ feature }) => feature?.properties?.color ?? 'white' },
                styleRules: [
                    { predicate: (props) => props.isShadow === true, style: { strokeColor: '#000000', strokeWidth: 4, strokeOpacity: 0.5 } },
                    { predicate: (props) => !props.isShadow, style: { strokeColor: '${getStrokeColor}', strokeWidth: 2, strokeOpacity: 1 } }
                ]
            });
            initializedLayers.add(_HN_LAYER_NAME);
        } catch (e) { }
        drawHNLines();
    }

    function destroyHNLines() {
        try { wmeSDK.Map.removeAllFeaturesFromLayer({ layerName: _HN_LAYER_NAME }); } catch (e) { }
    }

    function drawHNLines() {
        if (!hnLines) { destroyHNLines(); return; }
        const zoom = wmeSDK.Map.getZoomLevel();
        if (zoom < disableBelowZoom) { destroyHNLines(); return; }
        if (_hnDrawPending) return;

        const segsWithHNs = W?.model?.segments?.getObjectArray()?.filter(seg => seg?.attributes?.hasHNs && typeof seg.getID === 'function' && seg.getID() > 0) || [];
        if (segsWithHNs.length === 0) return;

        const extentStr = wmeSDK.Map.getMapExtent()?.join(',');
        if (_lastExtentStr === extentStr) return;
        _lastExtentStr = extentStr;

        _hnDrawPending = true;
        if (!W?.controller?.descartesClient?.getHouseNumbers) {
            _hnDrawPending = false;
            return;
        }
        W.controller.descartesClient.getHouseNumbers(segsWithHNs.map(s => s.getID()))
            .then(jsonData => {
                _hnDrawPending = false;
                if (!jsonData?.segmentHouseNumbers?.objects) return;
                const hnObjects = jsonData.segmentHouseNumbers.objects;
                const features = [];
                let fid = 0;

                for (const hnObj of hnObjects) {
                    if (!hnObj) continue;
                    const fp = hnObj.getFractionPoint();
                    if (!fp) continue;
                    const geomObj = hnObj.getOLGeometry ? hnObj.getOLGeometry() : hnObj.getGeometry();
                    if (!geomObj) continue;

                    let flon, flat, glon, glat;
                    if (fp.coordinates) { flon = fp.coordinates[0]; flat = fp.coordinates[1]; }
                    else if (fp.x != null) { const p = transformTo4326From900913(fp.x, fp.y); if (!p) continue; flon = p.x; flat = p.y; }
                    else continue;

                    if (geomObj.coordinates) { glon = geomObj.coordinates[0]; glat = geomObj.coordinates[1]; }
                    else if (geomObj.x != null) { const p = transformTo4326From900913(geomObj.x, geomObj.y); if (!p) continue; glon = p.x; glat = p.y; }
                    else continue;

                    const color = (typeof hnObj.isForced === 'function')
                        ? (hnObj.isForced() ? ((!hnObj.getUpdatedBy || !hnObj.getUpdatedBy()) ? 'red' : 'orange') : ((!hnObj.getUpdatedBy || !hnObj.getUpdatedBy()) ? 'yellow' : 'white'))
                        : 'white';

                    const coords = [[flon, flat], [glon, glat]];
                    features.push({ id: `qhn-s-${fid}`, type: 'Feature', geometry: { type: 'LineString', coordinates: coords }, properties: { isShadow: true } });
                    features.push({ id: `qhn-m-${fid}`, type: 'Feature', geometry: { type: 'LineString', coordinates: coords }, properties: { isShadow: false, color } });
                    fid++;
                }

                destroyHNLines();
                if (features.length > 0) wmeSDK.Map.addFeaturesToLayer({ layerName: _HN_LAYER_NAME, features });
            })
            .catch(err => { _hnDrawPending = false; console.error('QuickHN: HN Lines fetch error', err); });
    }
})();
