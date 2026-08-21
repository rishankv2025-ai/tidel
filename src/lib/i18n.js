// UI strings for English / Malayalam. Two modes only: 'en' shows English,
// 'ml' shows Malayalam. Entries that interpolate are functions.
// Date/weekday names come from toLocaleDateString via localeFor(), not from here.

export const LANGS = ['en', 'ml']
const LOCALE = { en: 'en-IN', ml: 'ml-IN' }
export function localeFor(lang) { return LOCALE[lang] || LOCALE.en }

// Label for the toggle: always names the language you'd switch TO, in its own script.
export function otherLangLabel(lang) { return lang === 'en' ? 'മലയാളം' : 'English' }
export function otherLang(lang) { return lang === 'en' ? 'ml' : 'en' }

// moonInfo() returns English phase names; map them rather than touching the math.
const PHASE = {
  en: {
    'New Moon': 'New Moon', 'Waxing Crescent': 'Waxing Crescent',
    'First Quarter': 'First Quarter', 'Waxing Gibbous': 'Waxing Gibbous',
    'Full Moon': 'Full Moon', 'Waning Gibbous': 'Waning Gibbous',
    'Last Quarter': 'Last Quarter', 'Waning Crescent': 'Waning Crescent',
  },
  // Phase names must stay DISTINCT from the white/black-moon tag below, which is
  // വെളുത്ത വാവ് / കറുത്ത വാവ്. Using those here too made the moon card print the
  // same words twice in Malayalam, so the phase uses the astronomical terms
  // (പൂർണ്ണചന്ദ്രൻ / അമാവാസി) and the tag keeps the traditional വാവ് wording.
  ml: {
    'New Moon': 'അമാവാസി', 'Waxing Crescent': 'വളരുന്ന ചന്ദ്രക്കല',
    'First Quarter': 'ആദ്യ പാദം', 'Waxing Gibbous': 'വളരുന്ന ചന്ദ്രൻ',
    'Full Moon': 'പൂർണ്ണചന്ദ്രൻ', 'Waning Gibbous': 'ക്ഷയിക്കുന്ന ചന്ദ്രൻ',
    'Last Quarter': 'അന്ത്യ പാദം', 'Waning Crescent': 'ക്ഷയിക്കുന്ന ചന്ദ്രക്കല',
  },
}
export function phaseName(lang, englishName) {
  return (PHASE[lang] || PHASE.en)[englishName] || englishName
}

const DICT = {
  en: {
    // header
    appTitle: 'Tide & Moon',
    tagline: 'accurate tide & moon dashboard',
    loading: 'Loading…',
    loadFail: e => `Could not load tide data: ${e}`,

    // location bar
    searchPlaceholder: '🔍 Search a place or station…',
    groupFavs: '★ Favourites',
    groupLocal: 'Kannur area',
    groupOther: 'Other stations',
    addFav: 'Add to favourites',
    removeFav: 'Remove from favourites',
    dataOnRefresh: 'data on refresh',
    useMyLocation: '📍 Use my location',
    saved: '★ Saved',
    save: '☆ Save',
    // Icon-only on phones. Text labels cannot fit beside the dropdown in
    // Malayalam (they needed 468px of a 366px bar), and shrinking the dropdown
    // enough to fit them truncates the place name — which is the thing you most
    // need to read. The full text stays as title/aria-label.
    useMyLocationShort: '📍',
    savedShort: '★',
    saveShort: '☆',
    geoUnsupported: 'Geolocation not supported',
    locating: 'Locating…',
    geoDenied: 'Location permission denied',
    nearest: 'nearest',
    showing: 'Showing',
    kmAway: km => `~${km} km away`,

    // moon card
    moonTitle: 'Moon',
    whiteMoon: '🌕 White Moon',
    blackMoon: '🌑 Black Moon',
    illumination: 'Illumination',
    moonAge: 'Moon age',
    days: 'days',
    zodiac: 'Zodiac',
    trend: 'Trend',
    waxing: 'Waxing',
    waning: 'Waning',
    nextFull: 'Next full',
    nextNew: 'Next new',

    // tide card
    tideTitle: 'Tide',
    now: 'Now',
    atNoon: 'at 12:00',
    aboveDatum: 'above chart datum',
    rising: '▲ Rising',
    falling: '▼ Falling',
    // segments: plain strings render as-is, {b} renders bold (styled by .nextline b)
    nextTide: (type, time, ht) => ['Next ', { b: type }, ' tide at ', { b: time }, ` (${ht})`],
    noFurtherTides: 'No further tides in range',
    high: 'High',
    low: 'Low',

    // forecast
    forecastTitle: '7-Day Forecast',
    filterAll: 'All',
    filterHigh: 'High only',
    filterLow: 'Low only',
    noTidesFiltered: f => `No ${f} tides this day`,
    // The bundled tide table covers a fixed window. Without this the forecast
    // just goes quiet as the window closes, which is how a month of expiry went
    // unnoticed — the app looked fine, it simply had fewer days to show.
    staleWarn: (n, last) => n <= 0
      ? 'Tide data has run out, so the forecast is empty. Refresh it (see README) to restore it.'
      : `Only ${n} day${n === 1 ? '' : 's'} of tide data left, through ${last}. ` +
        'Refresh it (see README) before it runs out.',

    // station without data
    // rendered after a bold station label, so it starts mid-sentence
    notLoadedRest:
      ' isn’t loaded yet. This station is registered for the nearest-station feature, ' +
      'but its tide table hasn’t been fetched. Run a data refresh (see README) to add it, then it appears here.',

    // notifications
    alertsOff: 'Enable browser alerts for today’s tide & moon summary and low-tide reminders (while the app is open).',
    showSummary: 'Show today’s summary',
    enableAlerts: 'Enable alerts',
    // dynamic alert rule builder
    alertSettings: 'Alert rule',
    leadTime: 'Warn me',
    // Lead times now run to 6 hours, so "360 min before" has to become "6 h before".
    minsBefore: n => (
      n < 60 ? `${n} min before`
        : n % 60 === 0 ? `${n / 60} h before`
        : `${Math.floor(n / 60)} h ${n % 60} min before`
    ),
    atTheTide: 'at the tide',
    whichTide: 'Which tide',
    anyTide: 'Any tide',
    onlyIf: 'Only if, at that tide',
    addCondition: '+ Add condition',
    removeCondition: 'Remove condition',
    opLt: 'below',
    opGt: 'above',
    fTideHeight: 'Tide height',
    fWindSpeed: 'Wind speed',
    fWindGust: 'Wind gust',
    fWaveHeight: 'Wave height',
    fHumidity: 'Humidity',
    ruleSummary: (when, kind, n) =>
      `Alerting ${when} the next ${kind} tide` + (n ? `, if ${n} condition${n > 1 ? 's' : ''} hold` : ''),
    nextAlertAt: (tide, fire) => `Next: ${tide} tide — alert at ${fire}`,
    alertBlocked: 'Conditions do not hold at that tide, so no alert is scheduled:',
    alertUnknownCond: 'no forecast for this',
    checkingConditions: 'Checking the forecast at that tide…',
    leadLongNote: 'A phone that has been asleep may deliver this a few minutes late.',
    // push
    pushOn: 'Alerts arrive even with the app closed.',
    pushSyncing: 'Registering for alerts…',
    pushInApp: 'Alerts arrive only while the app is open.',
    pushIosInstall: 'On iPhone, add this app to your Home Screen first — Safari cannot send alerts from a tab.',
    pushUnsupported: 'This browser cannot receive alerts while closed.',
    pushNotConfigured: 'Background alerts are not set up on the server yet — see SETUP-PUSH.md.',
    pushFail: d => `Could not register for background alerts: ${d}`,
    pushRetry: 'Try again',
    // daily summary
    dailyHead: 'Daily summary',
    dailyOn: 'Send a summary every day',
    dailyAt: 'At',
    dailyFor: 'For',
    dailyUseSelected: 'Whichever place is selected',
    dailyClosed: 'Deliver even when the app is closed',
    dailyLocalOnly: 'Kept on this device only, so it arrives while the app is open.',
    dailyPushUnavailable: 'Background delivery is unavailable here, so this stays on the device.',
    dailyNext: when => `Next summary ${when}`,
    dailyTomorrow: at => `tomorrow at ${at}`,
    dailyToday: at => `today at ${at}`,
    dailyBadTime: 'Enter a time between 00:00 and 23:59',
    testAlert: 'Test now',
    testShown: 'Shown. Delivered through the service worker, which is the only path Android allows.',
    testShownDesktop: 'Shown, via the desktop notification API. On Android the service worker handles it instead.',
    testErr: e => `The browser refused to create the notification: ${e}`,
    testNoTide: 'No matching tide in the loaded data to test with — try “Any tide”.',
    testNoPerm: 'Permission is not granted in this browser any more. Reload and enable alerts again.',
    ruleDisabled: 'Rule off — no tide alerts will fire.',
    toggleRuleOn: 'Turn rule on',
    toggleRuleOff: 'Turn rule off',
    notifUnsupported: 'Notifications not supported in this browser.',
    todaysTides: 'Today’s tides',
    lowTideSoon: 'Low tide soon',
    lowTideAt: (time, ht) => `Low tide at ${time} (${ht})`,
    noTideToday: 'No tide data for today',

    // conditions card
    weatherTitle: 'Conditions',
    wind: 'Wind',
    gusts: 'Gusts',
    humidity: 'Humidity',
    altitude: 'Altitude',
    temp: 'Temperature',
    feelsLike: 'Feels like',
    pressure: 'Pressure',
    rain: 'Rain',
    waveHeight: 'Wave height',
    wavePeriod: 'Wave period',
    weatherLoading: 'Loading conditions…',
    weatherFail: 'Conditions unavailable right now.',
    noWaveData: 'no wave data here',
    // deliberately says "model estimate", not "observed" — there is no gauge here
    modelTime: 'Model estimate for',
    weatherSrc: 'Open-Meteo forecast models (ICON for moisture, GFS for wind), not a local gauge. Altitude is a ~90 m DEM lookup at your exact spot.',
    spreadNote: 'The ± figure is how far the two models disagree — treat a large spread as low confidence.',
    gridOffset: km => `nearest model grid point is ${km} km away, so nearby spots can read identically`,

    // "this month" note under the conditions card
    monthTitle: 'Range here',
    monthMin: 'Lowest',
    monthMax: 'Highest',
    monthWaveHeight: 'Wave height',
    monthSwell: 'Swell period',
    monthTides: 'Tides',
    monthLoading: 'Reading this month…',

    // sun & moon card
    sunMoonTitle: 'Sun & Moon',
    sunrise: 'Sunrise',
    sunset: 'Sunset',
    dayLength: 'Day length',
    dawn: 'First light',
    dusk: 'Last light',
    moonrise: 'Moonrise',
    moonset: 'Moonset',
    moonNow: 'Moon now',
    moonUp: 'Above horizon',
    moonDown: 'Below horizon',
    moonAllDay: 'Up all day',
    moonNoEvent: 'none today',
    sunMoonSrc: 'Computed on-device from your coordinates. Times are IST.',

    // catch quality presets — set the slider without dragging it
    catchHow: 'How was it?',
    catchGood: '😀 Good',
    catchNormal: '🙂 Normal',
    catchBad: '😕 Bad',
    // inland spots: the marine grid point is kilometres out to sea
    riverNote: 'A river, so sea waves do not apply here. Tide and weather still do.',

    // catch report
    reportTitle: 'Report your catch',
    catchTypeQ: 'What did you catch?',
    fish: 'Fish',
    crab: 'Crab',
    other: 'Other',
    otherPlaceholder: 'Name it…',
    quantityQ: 'How much did you get from the sea?',
    kg: 'kg',
    notesLabel: 'Notes (optional)',
    notesPlaceholder: 'Anything worth noting…',
    submit: 'Submit report',
    submitting: 'Sending…',
    submitOk: 'Thanks — your report was saved.',
    submitFail: e => `Could not save: ${e}`,
    // A 404 here always means one thing: the serverless function is not running.
    // `npm run dev` is Vite alone and does not serve netlify/functions.
    submitNoServer: 'The save endpoint isn’t running. Start the app with “npm run dev:api” (netlify dev) instead of “npm run dev”.',
    reportHint: 'Saved together with the current tide, moon and weather, so the catch can be analysed against conditions.',

    // admin panel (/admin)
    admTitle: 'Admin — catch reports',
    admSignIn: 'Sign in',
    admUser: 'Username',
    admPass: 'Password',
    admBadLogin: 'Wrong username or password.',
    admNotConfigured: 'Admin access is not set up on the server. Set ADMIN_USER and ADMIN_PASSWORD in Netlify — see SETUP-ADMIN.md.',
    admNoServer: 'The admin API is not running. Start the app with “npm run dev:api”.',
    admSignOut: 'Sign out',
    admLoading: 'Loading reports…',
    admNoRows: 'No reports yet.',
    admNew: '+ New report',
    admEdit: 'Edit',
    admDelete: 'Delete',
    admSave: 'Save',
    admCancel: 'Cancel',
    admSelectAll: 'Select all',
    admSelected: n => `${n} selected`,
    admDeleteSel: n => `Delete ${n}`,
    admConfirmDelete: n => `Delete ${n} report${n > 1 ? 's' : ''}? This cannot be undone.`,
    admDeleted: n => `Deleted ${n}.`,
    admSaved: 'Saved.',
    admCreated: 'Report created.',
    admErr: e => `Failed: ${e}`,
    admEditing: id => `Editing report #${id}`,
    admCreating: 'New report',
    admIp: 'IP',
    admRefresh: 'Refresh',
    admDocs: '📖 Documentation',

    // per-report line chart + detail + table
    dashEveryReport: 'Every report',
    dashAxisKg: 'kg',
    dashPickPoint: 'Tap any point to see that report',
    dashReportN: n => `Report #${n}`,
    dashWhen: 'Reported',
    dashDevice: 'Device',
    dashPlace: 'Place',
    dashCaught: 'Caught',
    dashQty: 'Quantity',
    dashNotes: 'Notes',
    dashConditions: 'Conditions at that moment',
    dashCloseDetail: 'Close',
    dashBiggest: 'When the catch is biggest',
    dashBiggestNone: minN =>
      `Not enough reports yet. A condition needs ${minN} reports before it can be called a pattern.`,
    dashBiggestLead: 'Highest average catch so far, by condition:',
    dashNoData: 'no data',

    // catch analysis dashboard
    openDash: '📊 Open analysis',
    closeDash: '✕ Close analysis',
    dashTitle: 'Catch analysis',
    dashLoading: 'Loading reports…',
    dashFail: 'Could not load the analysis.',
    dashNotConfigured: 'No database configured yet, so there is nothing to analyse. See SETUP-SUPABASE.md.',
    dashEmpty: 'No reports yet. Submit a few catches and patterns will appear here.',
    dashReports: 'Reports',
    dashOverallAvg: 'Overall average',
    dashBest: 'Best so far',
    dashWorst: 'Worst so far',
    dashMeanLine: 'average',
    dashTooFew: 'too few',
    dashSamples: n => `n=${n}`,
    dashTable: 'Table',
    dashChart: 'Chart',
    // The whole point: refuse to state a finding that the data cannot support.
    dashThin: minN =>
      `No group has ${minN} reports yet, so nothing here is a finding — these are just the numbers collected so far.`,
    dashCaveat: minN =>
      `Groups with fewer than ${minN} reports are dimmed and excluded from “best” and “worst”. One good trip is not a pattern.`,
    fTideState: 'Tide state',
    fMoonPhase: 'Moon phase',
    fTideHeightBand: 'Tide height',
    fWindBand: 'Wind',
    fWaveBand: 'Wave height',
    fTimeOfDay: 'Time of day',
    fCatchKind: 'What was caught',
    fLocation: 'Place',
    bRising: 'Rising', bFalling: 'Falling',
    bNight: 'Night', bMorning: 'Morning', bAfternoon: 'Afternoon', bEvening: 'Evening',

    // footer
    footLine1: 'Tide predictions via Tide-Forecast.com (harmonic model, local chart datum) · Moon phase computed on-device.',
    footLine2a: 'Heights are approximate near shore and ',
    footLine2b: 'must not be used for navigation',
    // credit + copyright. The year is a fixed literal, not new Date(), because a
    // notice that silently changes year is not a claim anyone made.
    createdBy: 'Website created by Karnnan',
    copyright: '© 2027 Karnnan. All rights reserved.',
  },

  ml: {
    // header
    appTitle: 'വേലിയേറ്റം & ചന്ദ്രക്കല',
    tagline: 'കൃത്യമായ വേലി & ചന്ദ്ര ഡാഷ്ബോർഡ്',
    loading: 'ലോഡ് ചെയ്യുന്നു…',
    loadFail: e => `വേലി വിവരം ലഭ്യമായില്ല: ${e}`,

    // location bar
    // kept short — the long form was clipped by the input's width on mobile
    searchPlaceholder: '🔍 സ്ഥലം തിരയുക…',
    groupFavs: '★ പ്രിയപ്പെട്ടവ',
    groupLocal: 'കണ്ണൂർ പ്രദേശം',
    groupOther: 'മറ്റ് സ്റ്റേഷനുകൾ',
    addFav: 'പ്രിയപ്പെട്ടവയിൽ ചേർക്കുക',
    removeFav: 'പ്രിയപ്പെട്ടവയിൽ നിന്ന് നീക്കുക',
    dataOnRefresh: 'പുതുക്കുമ്പോൾ വിവരം',
    useMyLocation: '📍 എന്റെ സ്ഥലം ഉപയോഗിക്കുക',
    saved: '★ സേവ് ചെയ്തു',
    save: '☆ സേവ് ചെയ്യുക',
    useMyLocationShort: '📍',
    savedShort: '★',
    saveShort: '☆',
    geoUnsupported: 'ലൊക്കേഷൻ പിന്തുണയ്ക്കുന്നില്ല',
    locating: 'സ്ഥലം കണ്ടെത്തുന്നു…',
    geoDenied: 'ലൊക്കേഷൻ അനുമതി നിഷേധിച്ചു',
    nearest: 'ഏറ്റവും അടുത്തത്',
    showing: 'കാണിക്കുന്നത്',
    kmAway: km => `~${km} കി.മീ അകലെ`,

    // moon card
    moonTitle: 'ചന്ദ്രദശ',
    whiteMoon: '🌕 വെളുത്ത വാവ്',
    blackMoon: '🌑 കറുത്ത വാവ്',
    illumination: 'പ്രകാശം',
    moonAge: 'ചന്ദ്രവയസ്സ്',
    days: 'ദിവസം',
    zodiac: 'രാശി',
    trend: 'ദിശ',
    waxing: 'വളരുന്നു',
    waning: 'ക്ഷയിക്കുന്നു',
    nextFull: 'അടുത്ത വെളുത്ത വാവ്',
    nextNew: 'അടുത്ത കറുത്ത വാവ്',

    // tide card
    tideTitle: 'വേലി',
    now: 'ഇപ്പോൾ',
    atNoon: '12:00-ന്',
    aboveDatum: 'ചാർട്ട് ഡാറ്റത്തിന് മുകളിൽ',
    rising: '▲ കയറ്റം',
    falling: '▼ ഇറക്കം',
    nextTide: (type, time, ht) => ['അടുത്ത ', { b: type }, ' ', { b: time }, `-ന് (${ht})`],
    noFurtherTides: 'ഈ പരിധിയിൽ കൂടുതൽ വേലിയില്ല',
    high: 'വേലിയേറ്റം',
    low: 'വേലിയിറക്കം',

    // forecast
    forecastTitle: '7 ദിവസ പ്രവചനം',
    filterAll: 'എല്ലാം',
    filterHigh: 'വേലിയേറ്റം മാത്രം',
    filterLow: 'വേലിയിറക്കം മാത്രം',
    noTidesFiltered: f => `ഈ ദിവസം ${f} വേലിയില്ല`,
    staleWarn: (n, last) => n <= 0
      ? 'വേലി വിവരം തീർന്നു, അതിനാൽ പ്രവചനം ശൂന്യമാണ്. പുതുക്കുക (README കാണുക).'
      : `വേലി വിവരം ${n} ദിവസം മാത്രം ബാക്കി (${last} വരെ). ` +
        'തീരുന്നതിന് മുൻപ് പുതുക്കുക (README കാണുക).',

    // station without data
    notLoadedRest:
      ' ഇതുവരെ ലോഡ് ചെയ്തിട്ടില്ല. ഈ സ്റ്റേഷൻ ഏറ്റവും അടുത്തുള്ള സ്റ്റേഷൻ സൗകര്യത്തിനായി ' +
      'രജിസ്റ്റർ ചെയ്തിട്ടുണ്ട്, പക്ഷേ വേലി പട്ടിക എടുത്തിട്ടില്ല. വിവരം പുതുക്കിയാൽ (README കാണുക) ഇവിടെ കാണാം.',

    // notifications
    alertsOff: 'ഇന്നത്തെ വേലി & ചന്ദ്ര വിവരവും വേലിയിറക്ക അറിയിപ്പുകളും ലഭിക്കാൻ ബ്രൗസർ അലേർട്ട് ഓണാക്കുക (ആപ്പ് തുറന്നിരിക്കുമ്പോൾ).',
    showSummary: 'ഇന്നത്തെ വിവരം കാണിക്കുക',
    enableAlerts: 'അലേർട്ട് ഓണാക്കുക',
    alertSettings: 'അലേർട്ട് നിയമം',
    leadTime: 'എപ്പോൾ അറിയിക്കണം',
    minsBefore: n => (
      n < 60 ? `${n} മിനിറ്റ് മുൻപ്`
        : n % 60 === 0 ? `${n / 60} മണിക്കൂർ മുൻപ്`
        : `${Math.floor(n / 60)} മണിക്കൂർ ${n % 60} മിനിറ്റ് മുൻപ്`
    ),
    atTheTide: 'വേലി സമയത്ത്',
    whichTide: 'ഏത് വേലി',
    anyTide: 'ഏത് വേലിയും',
    onlyIf: 'ആ വേലി സമയത്ത് ഇവ ശരിയെങ്കിൽ മാത്രം',
    addCondition: '+ വ്യവസ്ഥ ചേർക്കുക',
    removeCondition: 'വ്യവസ്ഥ നീക്കുക',
    opLt: 'ഇതിൽ കുറവ്',
    opGt: 'ഇതിൽ കൂടുതൽ',
    fTideHeight: 'വേലി ഉയരം',
    fWindSpeed: 'കാറ്റിന്റെ വേഗം',
    fWindGust: 'ശക്തമായ കാറ്റ്',
    fWaveHeight: 'തിരമാല ഉയരം',
    fHumidity: 'ആർദ്രത',
    ruleSummary: (when, kind, n) =>
      `അടുത്ത ${kind} ${when} അറിയിക്കും` + (n ? `, ${n} വ്യവസ്ഥ ശരിയെങ്കിൽ` : ''),
    nextAlertAt: (tide, fire) => `അടുത്തത്: ${tide} — ${fire}-ന് അലേർട്ട്`,
    alertBlocked: 'ആ വേലി സമയത്ത് വ്യവസ്ഥകൾ ശരിയല്ല, അതിനാൽ അലേർട്ട് ഇല്ല:',
    alertUnknownCond: 'ഇതിന് പ്രവചനമില്ല',
    checkingConditions: 'ആ വേലി സമയത്തെ പ്രവചനം പരിശോധിക്കുന്നു…',
    leadLongNote: 'ഫോൺ ഉറങ്ങിക്കിടന്നിരുന്നെങ്കിൽ ഇത് കുറച്ച് മിനിറ്റ് വൈകിയേക്കാം.',
    // push
    pushOn: 'ആപ്പ് അടച്ചിരിക്കുമ്പോഴും അറിയിപ്പ് ലഭിക്കും.',
    pushSyncing: 'അറിയിപ്പുകൾക്ക് രജിസ്റ്റർ ചെയ്യുന്നു…',
    pushInApp: 'ആപ്പ് തുറന്നിരിക്കുമ്പോൾ മാത്രമേ അറിയിപ്പ് ലഭിക്കും.',
    pushIosInstall: 'iPhone-ൽ ആദ്യം ഈ ആപ്പ് ഹോം സ്ക്രീനിൽ ചേർക്കുക — Safari ടാബിൽ നിന്ന് അറിയിപ്പ് അയക്കാനാവില്ല.',
    pushUnsupported: 'ഈ ബ്രൗസറിന് അടച്ചിരിക്കുമ്പോൾ അറിയിപ്പ് ലഭിക്കില്ല.',
    pushNotConfigured: 'സെർവറിൽ പിന്നണി അറിയിപ്പുകൾ ഇനി ക്രമീകരിച്ചിട്ടില്ല — SETUP-PUSH.md കാണുക.',
    pushFail: d => `പിന്നണി അറിയിപ്പുകൾക്ക് രജിസ്റ്റർ ചെയ്യാനായില്ല: ${d}`,
    pushRetry: 'വീണ്ടും ശ്രമിക്കുക',
    // daily summary
    dailyHead: 'ദിവസേനയുള്ള വിവരം',
    dailyOn: 'എല്ലാ ദിവസവും വിവരം അയക്കുക',
    dailyAt: 'സമയം',
    dailyFor: 'സ്ഥലം',
    dailyUseSelected: 'തിരഞ്ഞെടുത്ത സ്ഥലം',
    dailyClosed: 'ആപ്പ് അടച്ചിരിക്കുമ്പോഴും അയക്കുക',
    dailyLocalOnly: 'ഈ ഉപകരണത്തിൽ മാത്രം സൂക്ഷിക്കുന്നു, അതിനാൽ ആപ്പ് തുറന്നിരിക്കുമ്പോൾ ലഭിക്കും.',
    dailyPushUnavailable: 'ഇവിടെ പിന്നണി അയക്കൽ ലഭ്യമല്ല, അതിനാൽ ഇത് ഉപകരണത്തിൽ മാത്രം.',
    dailyNext: when => `അടുത്ത വിവരം ${when}`,
    dailyTomorrow: at => `നാളെ ${at}-ന്`,
    dailyToday: at => `ഇന്ന് ${at}-ന്`,
    dailyBadTime: '00:00 മുതൽ 23:59 വരെയുള്ള സമയം നൽകുക',
    testAlert: 'ഇപ്പോൾ പരീക്ഷിക്കുക',
    testShown: 'കാണിച്ചു. സർവീസ് വർക്കർ വഴി — Android-ൽ ഇത് മാത്രമേ അനുവദിക്കൂ.',
    testShownDesktop: 'കാണിച്ചു, ഡെസ്ക്ടോപ്പ് രീതിയിൽ. Android-ൽ സർവീസ് വർക്കർ ഇത് കൈകാര്യം ചെയ്യും.',
    testErr: e => `അറിയിപ്പ് ഉണ്ടാക്കാൻ ബ്രൗസർ വിസമ്മതിച്ചു: ${e}`,
    testNoTide: 'പരീക്ഷിക്കാൻ അനുയോജ്യമായ വേലി വിവരത്തിലില്ല — “ഏത് വേലിയും” തിരഞ്ഞെടുക്കുക.',
    testNoPerm: 'ഈ ബ്രൗസറിൽ അനുമതി ഇപ്പോൾ ഇല്ല. റീലോഡ് ചെയ്ത് അലേർട്ട് വീണ്ടും ഓണാക്കുക.',
    ruleDisabled: 'നിയമം ഓഫാണ് — വേലി അലേർട്ട് വരില്ല.',
    toggleRuleOn: 'നിയമം ഓണാക്കുക',
    toggleRuleOff: 'നിയമം ഓഫാക്കുക',
    notifUnsupported: 'ഈ ബ്രൗസറിൽ അറിയിപ്പുകൾ പിന്തുണയ്ക്കുന്നില്ല.',
    todaysTides: 'ഇന്നത്തെ വേലി',
    lowTideSoon: 'വേലിയിറക്കം അടുത്തു',
    lowTideAt: (time, ht) => `വേലിയിറക്കം ${time}-ന് (${ht})`,
    noTideToday: 'ഇന്നത്തെ വേലി വിവരം ലഭ്യമല്ല',

    // conditions card
    weatherTitle: 'കാലാവസ്ഥ',
    wind: 'കാറ്റ്',
    gusts: 'ശക്തമായ കാറ്റ്',
    humidity: 'ആർദ്രത',
    altitude: 'ഉയരം',
    temp: 'താപനില',
    feelsLike: 'അനുഭവപ്പെടുന്നത്',
    pressure: 'മർദ്ദം',
    rain: 'മഴ',
    waveHeight: 'തിരമാല ഉയരം',
    wavePeriod: 'തിരമാല ഇടവേള',
    weatherLoading: 'കാലാവസ്ഥ ലോഡ് ചെയ്യുന്നു…',
    weatherFail: 'കാലാവസ്ഥാ വിവരം ഇപ്പോൾ ലഭ്യമല്ല.',
    noWaveData: 'തിരമാല വിവരം ഇവിടെ ലഭ്യമല്ല',
    modelTime: 'മോഡൽ കണക്ക്',
    weatherSrc: 'Open-Meteo പ്രവചന മോഡലുകൾ (ആർദ്രതയ്ക്ക് ICON, കാറ്റിന് GFS), പ്രാദേശിക അളവുയന്ത്രമല്ല. ഉയരം നിങ്ങളുടെ സ്ഥലത്തെ ~90 മീ DEM മൂല്യമാണ്.',
    spreadNote: '± എന്നത് രണ്ട് മോഡലുകൾ തമ്മിലുള്ള വ്യത്യാസമാണ് — വ്യത്യാസം വലുതെങ്കിൽ വിശ്വാസ്യത കുറവ്.',
    gridOffset: km => `അടുത്ത മോഡൽ ഗ്രിഡ് പോയിന്റ് ${km} കി.മീ അകലെ, അതിനാൽ അടുത്തുള്ള സ്ഥലങ്ങൾ ഒരേ വിവരം കാണിക്കാം`,

    // "this month" note under the conditions card
    monthTitle: 'ഇവിടത്തെ പരിധി',
    monthMin: 'ഏറ്റവും കുറവ്',
    monthMax: 'ഏറ്റവും കൂടുതൽ',
    monthWaveHeight: 'തിരമാല ഉയരം',
    monthSwell: 'തിരമാല ഇടവേള',
    monthTides: 'വേലി',
    monthLoading: 'ഈ മാസത്തെ വിവരം എടുക്കുന്നു…',

    // sun & moon card
    sunMoonTitle: 'സൂര്യൻ & ചന്ദ്രൻ',
    sunrise: 'സൂര്യോദയം',
    sunset: 'സൂര്യാസ്തമയം',
    dayLength: 'പകൽ ദൈർഘ്യം',
    dawn: 'ആദ്യ വെളിച്ചം',
    dusk: 'അവസാന വെളിച്ചം',
    moonrise: 'ചന്ദ്രോദയം',
    moonset: 'ചന്ദ്രാസ്തമയം',
    moonNow: 'ചന്ദ്രൻ ഇപ്പോൾ',
    moonUp: 'ചക്രവാളത്തിന് മുകളിൽ',
    moonDown: 'ചക്രവാളത്തിന് താഴെ',
    moonAllDay: 'ദിവസം മുഴുവൻ മുകളിൽ',
    moonNoEvent: 'ഇന്നില്ല',
    sunMoonSrc: 'നിങ്ങളുടെ സ്ഥാനത്ത് നിന്ന് ഉപകരണത്തിൽ ഗണിച്ചത്. സമയം IST.',

    // catch quality presets — set the slider without dragging it
    catchHow: 'എങ്ങനെയുണ്ടായിരുന്നു?',
    catchGood: '😀 നല്ലത്',
    catchNormal: '🙂 സാധാരണ',
    catchBad: '😕 മോശം',
    riverNote: 'ഇത് പുഴയാണ്, അതിനാൽ കടൽ തിരമാല ഇവിടെ ബാധകമല്ല. വേലിയും കാലാവസ്ഥയും ബാധകമാണ്.',

    // catch report
    reportTitle: 'നിങ്ങളുടെ പിടിത്തം രേഖപ്പെടുത്തുക',
    catchTypeQ: 'എന്താണ് കിട്ടിയത്?',
    fish: 'മീൻ',
    crab: 'ഞണ്ട്',
    other: 'മറ്റുള്ളവ',
    otherPlaceholder: 'പേര് എഴുതുക…',
    quantityQ: 'കടലിൽ നിന്ന് എത്ര കിട്ടി?',
    kg: 'കി.ഗ്രാം',
    notesLabel: 'കുറിപ്പ് (നിർബന്ധമില്ല)',
    notesPlaceholder: 'എന്തെങ്കിലും കുറിക്കാൻ…',
    submit: 'രേഖപ്പെടുത്തുക',
    submitting: 'അയക്കുന്നു…',
    submitOk: 'നന്ദി — നിങ്ങളുടെ വിവരം സേവ് ചെയ്തു.',
    submitFail: e => `സേവ് ചെയ്യാനായില്ല: ${e}`,
    submitNoServer: 'സേവ് ചെയ്യുന്ന സെർവർ പ്രവർത്തിക്കുന്നില്ല. “npm run dev” എന്നതിന് പകരം “npm run dev:api” ഉപയോഗിച്ച് ആപ്പ് തുടങ്ങുക.',
    reportHint: 'ഇപ്പോഴത്തെ വേലി, ചന്ദ്രദശ, കാലാവസ്ഥ എന്നിവയോടൊപ്പം സേവ് ചെയ്യുന്നു, അതിനാൽ സാഹചര്യങ്ങളുമായി താരതമ്യം ചെയ്ത് പഠിക്കാം.',

    // admin panel (/admin)
    admTitle: 'അഡ്മിൻ — പിടിത്ത റിപ്പോർട്ടുകൾ',
    admSignIn: 'സൈൻ ഇൻ',
    admUser: 'ഉപയോക്തൃനാമം',
    admPass: 'പാസ്‌വേഡ്',
    admBadLogin: 'ഉപയോക്തൃനാമമോ പാസ്‌വേഡോ തെറ്റാണ്.',
    admNotConfigured: 'സെർവറിൽ അഡ്മിൻ ക്രമീകരിച്ചിട്ടില്ല. Netlify-യിൽ ADMIN_USER, ADMIN_PASSWORD സെറ്റ് ചെയ്യുക — SETUP-ADMIN.md കാണുക.',
    admNoServer: 'അഡ്മിൻ API പ്രവർത്തിക്കുന്നില്ല. “npm run dev:api” ഉപയോഗിച്ച് തുടങ്ങുക.',
    admSignOut: 'സൈൻ ഔട്ട്',
    admLoading: 'റിപ്പോർട്ടുകൾ ലോഡ് ചെയ്യുന്നു…',
    admNoRows: 'ഇതുവരെ റിപ്പോർട്ടുകളില്ല.',
    admNew: '+ പുതിയ റിപ്പോർട്ട്',
    admEdit: 'തിരുത്തുക',
    admDelete: 'ഇല്ലാതാക്കുക',
    admSave: 'സേവ് ചെയ്യുക',
    admCancel: 'റദ്ദാക്കുക',
    admSelectAll: 'എല്ലാം തിരഞ്ഞെടുക്കുക',
    admSelected: n => `${n} തിരഞ്ഞെടുത്തു`,
    admDeleteSel: n => `${n} ഇല്ലാതാക്കുക`,
    admConfirmDelete: n => `${n} റിപ്പോർട്ട് ഇല്ലാതാക്കണോ? ഇത് പഴയപടിയാക്കാനാവില്ല.`,
    admDeleted: n => `${n} ഇല്ലാതാക്കി.`,
    admSaved: 'സേവ് ചെയ്തു.',
    admCreated: 'റിപ്പോർട്ട് ഉണ്ടാക്കി.',
    admErr: e => `പരാജയപ്പെട്ടു: ${e}`,
    admEditing: id => `റിപ്പോർട്ട് #${id} തിരുത്തുന്നു`,
    admCreating: 'പുതിയ റിപ്പോർട്ട്',
    admIp: 'IP',
    admRefresh: 'പുതുക്കുക',
    admDocs: '📖 ഡോക്യുമെന്റേഷൻ',

    // per-report line chart + detail + table
    dashEveryReport: 'എല്ലാ റിപ്പോർട്ടുകളും',
    dashAxisKg: 'കി.ഗ്രാം',
    dashPickPoint: 'ഏതെങ്കിലും പോയിന്റിൽ ടാപ്പ് ചെയ്ത് ആ റിപ്പോർട്ട് കാണുക',
    dashReportN: n => `റിപ്പോർട്ട് #${n}`,
    dashWhen: 'രേഖപ്പെടുത്തിയത്',
    dashDevice: 'ഉപകരണം',
    dashPlace: 'സ്ഥലം',
    dashCaught: 'കിട്ടിയത്',
    dashQty: 'അളവ്',
    dashNotes: 'കുറിപ്പ്',
    dashConditions: 'അപ്പോഴത്തെ സാഹചര്യങ്ങൾ',
    dashCloseDetail: 'അടയ്ക്കുക',
    dashBiggest: 'എപ്പോഴാണ് കൂടുതൽ കിട്ടുന്നത്',
    dashBiggestNone: minN =>
      `ഇതുവരെ മതിയായ റിപ്പോർട്ടുകളില്ല. ഒരു സാഹചര്യം ഒരു രീതിയാകാൻ ${minN} റിപ്പോർട്ട് വേണം.`,
    dashBiggestLead: 'ഇതുവരെ ഏറ്റവും ഉയർന്ന ശരാശരി, സാഹചര്യം അനുസരിച്ച്:',
    dashNoData: 'വിവരമില്ല',

    // catch analysis dashboard
    openDash: '📊 വിശകലനം കാണുക',
    closeDash: '✕ വിശകലനം അടയ്ക്കുക',
    dashTitle: 'പിടിത്ത വിശകലനം',
    dashLoading: 'വിവരങ്ങൾ ലോഡ് ചെയ്യുന്നു…',
    dashFail: 'വിശകലനം ലഭ്യമാക്കാനായില്ല.',
    dashNotConfigured: 'ഡാറ്റാബേസ് ക്രമീകരിച്ചിട്ടില്ല, അതിനാൽ വിശകലനം ചെയ്യാൻ ഒന്നുമില്ല. SETUP-SUPABASE.md കാണുക.',
    dashEmpty: 'ഇതുവരെ റിപ്പോർട്ടുകളില്ല. കുറച്ച് പിടിത്തങ്ങൾ രേഖപ്പെടുത്തിയാൽ ഇവിടെ കാണാം.',
    dashReports: 'റിപ്പോർട്ടുകൾ',
    dashOverallAvg: 'മൊത്തം ശരാശരി',
    dashBest: 'ഇതുവരെ ഏറ്റവും നല്ലത്',
    dashWorst: 'ഇതുവരെ ഏറ്റവും കുറവ്',
    dashMeanLine: 'ശരാശരി',
    dashTooFew: 'വളരെ കുറവ്',
    dashSamples: n => `n=${n}`,
    dashTable: 'പട്ടിക',
    dashChart: 'ചാർട്ട്',
    dashThin: minN =>
      `ഒരു ഗ്രൂപ്പിലും ${minN} റിപ്പോർട്ട് ആയിട്ടില്ല, അതിനാൽ ഇത് നിഗമനമല്ല — ഇതുവരെ ശേഖരിച്ച സംഖ്യകൾ മാത്രം.`,
    dashCaveat: minN =>
      `${minN}-ൽ കുറവ് റിപ്പോർട്ടുള്ള ഗ്രൂപ്പുകൾ മങ്ങിയതാണ്, “നല്ലത്”/“കുറവ്” എന്നതിൽ ഉൾപ്പെടുത്തിയിട്ടില്ല. ഒരു നല്ല യാത്ര ഒരു രീതിയല്ല.`,
    fTideState: 'വേലിയുടെ അവസ്ഥ',
    fMoonPhase: 'ചന്ദ്രദശ',
    fTideHeightBand: 'വേലി ഉയരം',
    fWindBand: 'കാറ്റ്',
    fWaveBand: 'തിരമാല ഉയരം',
    fTimeOfDay: 'സമയം',
    fCatchKind: 'എന്ത് കിട്ടി',
    fLocation: 'സ്ഥലം',
    bRising: 'കയറ്റം', bFalling: 'ഇറക്കം',
    bNight: 'രാത്രി', bMorning: 'രാവിലെ', bAfternoon: 'ഉച്ചയ്ക്ക്', bEvening: 'വൈകുന്നേരം',

    // footer
    footLine1: 'വേലി പ്രവചനം Tide-Forecast.com വഴി (ഹാർമോണിക് മോഡൽ, പ്രാദേശിക ചാർട്ട് ഡാറ്റം) · ചന്ദ്രദശ ഉപകരണത്തിൽ ഗണിച്ചത്.',
    footLine2a: 'തീരത്തിനടുത്ത് ഉയരങ്ങൾ ഏകദേശമാണ്, ',
    footLine2b: 'കപ്പൽയാത്രയ്ക്ക് ഉപയോഗിക്കരുത്',
    createdBy: 'വെബ്‌സൈറ്റ് നിർമ്മിച്ചത് കർണ്ണൻ',
    copyright: '© 2027 കർണ്ണൻ. എല്ലാ അവകാശങ്ങളും നിക്ഷിപ്തം.',
  },
}

export function t(lang) { return DICT[lang] || DICT.en }

// Malayalam place name when in 'ml' and one exists, else the English label.
export function placeName(lang, label, ml) { return (lang === 'ml' && ml) ? ml : label }
