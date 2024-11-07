import * as utils from "./modules/subswitch_utils.mjs";
import * as menus from "./modules/menus.mjs";
import * as items from "./modules/subswitch_items.js";
import * as message_subject_util from "./modules/message_subject_util.js";


//FIXME const file
const SUBSWITCH_MIME_HEADER = 'X-SubSwitch';

async function initMenu() {
    const contextmenu = await browser.LegacyPrefs.getPref("extensions.subjects_prefix_switch.contextmenu");

    if (!contextmenu) {
        return
    }

    await items.loadPrefixesDataString();

    let list = items.getPrefixesData();
    let defaultRD = list.defaultPrefixIndex;

    for (let [index, prefix] of list.entries()) {
        await menus.addMenuEntry({
            id: `prefix-menu-${index}`,
            contexts: ["compose_body"],
            type: "radio",
            title: prefix.description
        });
    }
}

async function settingsChangeAction(name, value) {
    console.log(`Changed value in "subswitch.": ${name} = ${value}`);

    await items.reloadPrefixesDataString();
    //TODO TO TEST removeAll
    await browser.menus.removeAll();
    await initMenu();
}

async function main() {
    console.log("Init of subswitch - START");

    // Prepare legacy prefs. The very last conversion step will migrate these to
    // WebExtension storage.
    await browser.LegacyPrefs.setDefaultPref("extensions.subjects_prefix_switch.addRDtoEmail", true);
    await browser.LegacyPrefs.setDefaultPref("extensions.subjects_prefix_switch.beforeMsgSubject", true);
    await browser.LegacyPrefs.setDefaultPref("extensions.subjects_prefix_switch.contextmenu", true);
    await browser.LegacyPrefs.setDefaultPref("extensions.subjects_prefix_switch.defaultrd", "1");
    await browser.LegacyPrefs.setDefaultPref("extensions.subjects_prefix_switch.discoveryIgnoreList", "bugzilla?@?.com");
    await browser.LegacyPrefs.setDefaultPref("extensions.subjects_prefix_switch.discoveryIgnoreSigns", "[]/ ");
    await browser.LegacyPrefs.setDefaultPref("extensions.subjects_prefix_switch.discoveryItemPattern", "\\[.+\\]");
    await browser.LegacyPrefs.setDefaultPref("extensions.subjects_prefix_switch.entries_split_sign", "##");
    await browser.LegacyPrefs.setDefaultPref("extensions.subjects_prefix_switch.entry_split_sign", "~~");
    await browser.LegacyPrefs.setDefaultPref("extensions.subjects_prefix_switch.loadRDfromEmail", true);
    await browser.LegacyPrefs.setDefaultPref("extensions.subjects_prefix_switch.offbydefault", false);
    await browser.LegacyPrefs.setDefaultPref("extensions.subjects_prefix_switch.rds", "Organizational mail~~[ORG]~~false##Project ABCD~~[ABCD/{number:NN}][{date:yyyy/mm/dd}]~~true##Private mail~~[PRV]~~true~~[PRIV]");
    await browser.LegacyPrefs.setDefaultPref("extensions.subjects_prefix_switch.rds_addresses", "");
    await browser.LegacyPrefs.setDefaultPref("extensions.subjects_prefix_switch.rds_sequences", "");

    // replaced by
    //    () => browser.runtime.openOptionsPage()
    // to open the new WebExtension options page. However, this is actually bad
    // practice. Users are now used to find options in the add-on manager and the
    // old pattern of adding stuff to the tools menu should no longer be used.
    browser.menus.create({
        id: "oldOptions",
        contexts: ["tools_menu"],
        title: browser.i18n.getMessage("subjects_prefix_switch.label.toolbar"),
        onclick: () => browser.runtime.openOptionsPage()
    })

    console.log("Init of subswitch - END");
}

async function getPrefixForTabId(tabid) {
    const value = await utils.getFromSession(`currentPrefix-${tabid}`);

    const prefixes = items.getPrefixesData();

    var item = items.createNewPrefix(value, value);
    let idx = prefixes.indexOf(item);

    if (idx >= 0) {
        return prefixes[idx];
    } else {
        return null;
    }
}

async function customSendAction(tab, composeDetails) {
    // Perform any modifications or logging
    utils.dumpStr("SubSwitch -> Sending email START");
    utils.dumpStr(`SubSwitch -> Sending email composeDetails ${JSON.stringify(composeDetails)}${JSON.stringify(composeDetails)}`);

    items.loadPrefixesDataString();

    const addRDtoEmail = await browser.LegacyPrefs.getPref("extensions.subjects_prefix_switch.addRDtoEmail");

    utils.dumpStr(`SubSwitch -> Sending email addRDtoEmail ${addRDtoEmail}`);

    if (addRDtoEmail) {
        const selectedPrefix = await getPrefixForTabId(tab.id);

        utils.dumpStr(`SubSwitch -> Sending email selectedPrefix ${selectedPrefix}`);

        if (selectedPrefix) {
            selectedPrefix.incSeqValue();

           //savePrefixes
           //com.ktsystems.subswitch.PrefixesListSingleton.getInstance().savePrefixesSequences();

            if (!composeDetails.customHeaders) {
                composeDetails.customHeaders = [];
            }

            let ch = {
                name: SUBSWITCH_MIME_HEADER,
                value: (selectedPrefix.description + "; " + selectedPrefix.prefixCode)
            };

            composeDetails.customHeaders.push(ch);
            browser.compose.setComposeDetails(tab.id, composeDetails);
        }
    }

    utils.dumpStr(`SubSwitch -> Sending email composeDetails ${JSON.stringify(composeDetails)}`);
    utils.dumpStr("SubSwitch -> Sending email END");
    // Continue with sending the email
    return true;
}


function registerListeners() {

    // Monitor the preferences
    browser.LegacyPrefs.onChanged.addListener(
        settingsChangeAction,
        "extensions.subjects_prefix_switch."
    );

    // Attach the custom send action
    browser.compose.onBeforeSend.addListener(customSendAction);

    messenger.menus.onClicked.addListener(async (info, tab) => {
        const index = info.menuItemId.substring(12);

        let list = items.getPrefixesData();
        let listItem = list[index];

        utils.dumpStr("messenger XXXX -> onClicked " + listItem.prefixCode);

        await message_subject_util.alterSubject(tab.id, listItem, list);
    })

    //listener for new message & setting the subject;
    messenger.compose.onComposeStateChanged.addListener( async (tab, state) => {
        utils.dumpStr(`messenger XXXX -> onComposeStateChanged ${JSON.stringify(tab)}`);
        utils.dumpStr(`messenger XXXX -> onComposeStateChanged ${JSON.stringify(state)}`);

        const value = await utils.getFromSession(`initiatedWithPrefix-${tab.id}`);
        utils.dumpStr(`messenger XXXX -> onComposeStateChanged ${value}`);
        if (!value) {
            let list = items.getPrefixesData();

            if (!list.defaultPrefixOff && list.defaultPrefixIndex >= 0) {
                let listItem = list[list.defaultPrefixIndex];
                utils.dumpStr(`messenger XXXX -> onComposeStateChanged setting the ${listItem}`);

                await message_subject_util.alterSubject(tab.id, listItem, list);
            }

            await utils.saveToSession(`initiatedWithPrefix-${tab.id}`, list.defaultPrefixIndex);
            utils.dumpStr(`messenger XXXX -> onComposeStateChanged saving the ${list.defaultPrefixIndex}`);
        }
    });

    browser.menus.onShown.addListener(async (info, tab) => {
        utils.dumpStr(`messenger XXXX -> onShown ${JSON.stringify(info)}`);
        utils.dumpStr(`messenger XXXX -> onShown ${JSON.stringify(tab)}`);

        await items.loadPrefixesDataString();

        let list = items.getPrefixesData();
        let index = await message_subject_util.getPrefixIndexForTabId(tab.id, list);

        utils.dumpStr(`messenger XXXX -> onShown0 ${index}`);

        for (let [indexMenu, prefix] of info.menuIds.entries()) {
            browser.menus.update(`prefix-menu-${indexMenu}`, {checked: indexMenu===index});
            browser.menus.refresh();
        }
    });

    // handle
    // 1/ the opening the new message with subject
    browser.runtime.onMessage.addListener((message, sender) => {
        if (message && message.hasOwnProperty("command") ) {
            return doHandleCommand(message, sender);
        }
    });
}

main();
initMenu();
registerListeners();

/**
 * Handles commands received from the compose script, to send make the
 * ComposeDetails available to the compose script.
 */
async function doHandleCommand (message, sender) {
    const { command } = message;
    const { prefix } = message;

    utils.log(`background -> doHandleCommand START ${command} `);

    switch(command) {
        case "composeWithPrefix":

            let list = items.getPrefixesData();
            let listItem = list[prefix];

            let composeDetails = {
                subject: listItem.formattedPrefixValue
            };

            utils.insertAddress(composeDetails, listItem);
            utils.log(`background -> doHandleCommand composeWithPrefix for the prefix ${listItem.prefixCode} composeDetails: ${JSON.stringify(composeDetails)}`);

            try {
               browser.compose.beginNew(
                    composeDetails
                ).then((composeWindow) => {
                   utils.log(`background -> doHandleCommand composeWithPrefix inside beginNew START`);
                   utils.dumpDir(composeWindow);
                   message_subject_util.updatePrefixForTabId(composeWindow.id, listItem);
                   utils.log(`background -> doHandleCommand composeWithPrefix inside beginNew END`);
               });

                utils.log(`background -> doHandleCommand composeWithPrefix after beginNew `);
            } catch (e) {
                utils.dumpError("background -> doHandleCommand composeWithPrefix exception:" + e);
            }

            break;
    }

    utils.log(`background -> doHandleCommand END ${command} `);
}


//TODO WONT DO on_off_prefix button

//TODO loadOriginalMsgSSHeader / isAddressOnIgnoreList / findSubSwitchHeader / displayConfirm
//TODO FORMAT DATE
//TODO localize

//DONE checkbox
//DONE prefixModalAlertShow(msgDuplicate);
//DONE  initWithDefault / on_off_prefix
//DONE  initMenuPopup
//DONE onSend

