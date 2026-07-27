const state = {
  token: localStorage.getItem("aivf_token") || "",
  sidebarCollapsed: localStorage.getItem("aivf_sidebar_collapsed") === "1",
  user: null,
  assets: [],
  voices: [],
  jobs: [],
  selectedFinishedJobIds: new Set(),
  assetGroups: [],
  activeAssetGroupId: localStorage.getItem("aivf_active_asset_group") || "all",
  assetModalOpen: false,
  selectedLibraryAssetIds: JSON.parse(localStorage.getItem("aivf_selected_library_assets") || "[]"),
  lastResearch: null,
  lastRender: null,
  progressTimers: {},
  scriptTopicOptions: [],
  selectedTopicIndex: 0,
  activeTemplateCategory: "鍚屽煄鐭棰?,
  shots: [],
};

const $ = (id) => document.getElementById(id);
const apiSearchParam = new URLSearchParams(location.search).get("api");
if (apiSearchParam) {
  localStorage.setItem("aivf_api_base_url", apiSearchParam.trim().replace(/\/+$/, ""));
}
const configuredApiBaseUrl = String(window.AIVF_API_BASE_URL || localStorage.getItem("aivf_api_base_url") || "").trim().replace(/\/+$/, "");
const staticPreviewMode = location.hostname.endsWith(".github.io") && !configuredApiBaseUrl;
const staticPreviewMessage = "褰撳墠鏄?GitHub Pages 闈欐€侀瑙堢増锛屽彧鑳借繘鍏ラ〉闈㈤瑙堬紱鐧诲綍銆佷笂浼犮€丄I 鐢熸垚銆侀厤闊冲拰鍓棰戦渶瑕佽繛鎺ュ悗绔湇鍔°€?;

const researchRegenerateLimit = 3;
const researchRegenerateWindowMs = 5 * 60 * 1000;
const researchRegenerateStorageKey = "aivf_research_regen_window";
const topicNumberLabels = ["涓€", "浜?, "涓?, "鍥?, "浜?];
const assetGroupStorageKey = "aivf_asset_groups";
const assetQuotaBytes = 5 * 1024 * 1024 * 1024;
const workspaceDraftVersion = 1;
const workspaceDraftFieldIds = [
  "modelMode",
  "storeIndustry",
  "brandName",
  "storeCity",
  "storeLocation",
  "personaName",
  "personaAge",
  "personaGender",
  "businessYears",
  "hometown",
  "mainProduct",
  "serviceAdvantage",
  "extraInfo",
  "resultStrategy",
  "scriptDossier",
  "scriptModelMode",
  "templateSelect",
  "scriptTitleStyle",
  "localAudienceSegment",
  "localAgeRange",
  "scriptTopicIdeas",
  "resultTitle",
  "resultTags",
  "resultScript",
  "resultPrompts",
  "ttsVoiceSelect",
  "voiceSpeed",
  "renderCount",
  "subtitleStyle",
  "titleStyle",
  "bgmMode",
  "ttsText",
  "videoTitle",
  "videoScript",
  "editorVoiceSelect",
  "editorVoiceSpeed",
  "editorBgmMode",
  "voiceName",
];
const workspaceDraftExcludedIds = new Set([
  "loginPassword",
  "assetFile",
  "voiceConsent",
]);
let workspaceDraftTimer = null;
let isRestoringWorkspaceDraft = false;
let editProgressTimer = null;

const defaultAssetGroups = [
  { id: "ungrouped", name: "鏈垎缁?, locked: true },
];

const requiredDossierFields = [
  ["storeIndustry", "鎮ㄧ殑琛屼笟鏄粈涔?],
  ["brandName", "鎮ㄧ殑搴楀悕/鍝佺墝鍚?],
  ["storeCity", "闂ㄥ簵鎵€鍦ㄧ殑鍩庡競"],
  ["storeLocation", "闂ㄥ簵浣嶇疆绠€鍗曟弿杩?],
  ["personaName", "鐭棰戜腑鐨勮嚜鎴戠О鍛?],
  ["personaAge", "鎮ㄧ殑骞撮緞"],
  ["personaGender", "鎮ㄧ殑鎬у埆"],
  ["businessYears", "琛屼笟/闂ㄥ簵骞撮檺"],
  ["hometown", "鎮ㄨ嚜宸辨槸鍝噷浜?],
];

const localAudienceAgeMap = {
  "浜虹兢涓嶉檺": { label: "涓嶉檺", min: null, max: null },
  "Z 涓栦唬": { label: "18-23 宀?, min: 18, max: 23 },
  "鏂伴攼鐧介": { label: "24-30 宀?, min: 24, max: 30 },
  "绮捐嚧濡堝": { label: "25-40 宀?, min: 25, max: 40 },
  "璧勬繁涓骇": { label: "31-50 宀?, min: 31, max: 50 },
  "閮藉競钃濋": { label: "24-45 宀?, min: 24, max: 45 },
  "灏忛晣闈掑勾": { label: "18-23 宀?, min: 18, max: 23 },
  "灏忛晣涓€佸勾": { label: "41-60 宀?, min: 41, max: 60 },
  "閮藉競閾跺彂": { label: "60 宀佷互涓?, min: 60, max: null },
};

const workspaceCopy = {
  researchTab: {
    title: "璋冪爺妗ｆ",
    subtitle: "鍏堣绯荤粺鐞嗚В浣犳槸璋併€佸簵閾烘儏鍐靛拰褰撳墠鍗＄偣銆?
  },
  scriptTab: {
    title: "鑴氭湰",
    subtitle: "鍩轰簬璋冪爺缁撴灉锛岀敓鎴愭祦閲忋€佸悓鍩庢垨鍥㈠崟鐭棰戠殑鏂囨鍜屽垎闀溿€?
  },
  libraryTab: {
    title: "瑙嗛搴?,
    subtitle: "闆嗕腑绠＄悊鍙ｆ挱銆侀棬搴楃幆澧冦€侀」鐩繃绋嬨€侀【瀹㈠弽棣堛€佷骇鍝佸浘鍜屽０闊虫牱鏈€?
  },
  editorTab: {
    title: "鍓緫",
    subtitle: "鎶婃枃妗堝垎闀滄寜闀滃ご瀵煎叆锛屽啀鍖归厤瑙嗛搴撶礌鏉愬舰鎴愭贩鍓粨鏋勩€?
  },
  exportTab: {
    title: "鎴愬搧绱犳潗搴?,
    subtitle: "鍍忕礌鏉愯棰戝簱涓€鏍蜂繚瀛樻垚鐗囨晥鏋滐紝鏂逛究棰勮銆佷笅杞藉拰澶嶇敤銆?
  }
};

const templateLibrary = {
  "娴侀噺鐭棰?: [
    {
      id: "traffic-video",
      name: "娴侀噺鐭棰?,
      content: "搴曞眰閫昏緫锛氭祦閲忕殑鏈川鏄汉鎬с€傚厛杩囦汉鑴戠瓫閫夛紝鍐嶈繃骞冲彴绛涢€夈€俓n鎬濊€冩鏋讹細瀵硅薄閿氬畾 鈫?涓冩儏鍏鐐圭伀 鈫?榛勯噾 5 绉掑仠鐣?鈫?鍦烘櫙鎵挎帴 鈫?淇′换绛涢€?鈫?鍔ㄤ綔鐫€闄嗐€俓n閫夐鏂瑰悜锛氬弽甯歌瘑銆佽鍧戦伩闆枫€佹€曢敊杩囥€佹€曟帀闃熴€佽交鏉捐幏寰椼€佹浛鐢ㄦ埛琛ㄨ揪涓嶆弧銆佽€佹澘鐪熷疄瑙傜偣銆俓n杈撳嚭瑕佹眰锛氬厛缁?3-5 涓€夐锛屽啀閫?1 涓敓鎴愭枃妗?+ 鍒嗛暅锛涘彛鎾瘡涓煭鍙ュ敖閲?8-12 瀛楋紝灏戠敤閫楀彿锛屽紑澶村繀椤绘湁鎯呯华寮犲姏銆?
    }
  ],
  "鍚屽煄鐭棰?: [
    {
      id: "local-city-video",
      name: "鍚屽煄鐭棰?,
      content: "搴曞眰閫昏緫锛氬悓鍩庝笉鏄彧璁茶涓氾紝鑰屾槸鐢ㄥ煄甯傜敓娲汇€佸ぉ姘斻€佸晢鍦堛€佹秷璐逛範鎯€佷汉缇ゆ儏缁瓑娉涘瀭鐩村唴瀹瑰湀浣忛檮杩戠殑浜恒€俓n鎬濊€冩鏋讹細鍏堥€変汉缇ゅ拰骞撮緞锛屽啀缁撳悎鍩庡競涓庨棬搴楁。妗堬紝鎵惧埌杩欎釜缇や綋浼氬仠鐣欍€佷細鍏遍福銆佷細鍒板簵鐨勫垏鍙ｃ€俓n閫夐鏂瑰悜锛氬煄甯傚ぉ姘斻€侀檮杩戠敓娲汇€佷笅鐝満鏅€佸搴叧绯汇€佽仛浼氶キ灞€銆佺簿鑷寸敓娲汇€侀伩鍧戙€佺渷閽便€佹澗寮涙劅銆俓n杈撳嚭瑕佹眰锛氬繀椤荤粨鍚堝凡閫変汉缇ゅ拰骞撮緞鑼冨洿锛屽厛缁欑牬鍦堥€夐锛屽啀鐢熸垚鍐呭 + 鍒嗛暅锛涘彛鎾煭鍙ュ敖閲?8-12 瀛楋紝灏戞墦閫楀彿銆?
    }
  ],
  "鍥㈠崟鐭棰?: [
    {
      id: "group-deal-video",
      name: "鍥㈠崟鐭棰?,
      content: "搴曞眰閫昏緫锛氬洟鍗曠煭瑙嗛涓嶆槸鐩存帴鍚嗗枬渚垮疁锛岃€屾槸闄嶄綆鍐崇瓥鎴愭湰銆俓n鎬濊€冩鏋讹細璋侀€傚悎 鈫?涓轰粈涔堝€?鈫?杩囩▼鏄惁鍙俊 鈫?鍒板簵鎬庝箞鐢?鈫?鐜板湪涓轰粈涔堣涔般€俓n閫夐鏂瑰悜锛氬椁愭媶瑙ｃ€侀€傚悎/涓嶉€傚悎浜虹兢銆佺湡瀹炰綋楠屾祦绋嬨€佸埌搴楅伩鍧戙€侀檺鏃剁鍒┿€佽€佸鎺ㄨ崘銆俓n杈撳嚭瑕佹眰锛氬厛缁?3-5 涓洟鍗曡浆鍖栭€夐锛屽啀鐢熸垚鏂囨 + 鍒嗛暅锛涜〃杈捐鍏蜂綋锛屼笉纭帹锛涘彛鎾煭鍙ュ敖閲?8-12 瀛椼€?
    }
  ]
};

const titleTemplateLibrary = {
  "鏅鸿兘鎺ㄨ崘鏍峰紡": "绯荤粺鎸夊綋鍓嶇郴鍒楄嚜鍔ㄦ寫鏍囬锛氭祦閲忎紭鍏堢棝鐐?鍙嶅樊锛屽悓鍩庝紭鍏堝煄甯傚満鏅紝鍥㈠崟浼樺厛鎴愪氦鐞嗙敱銆?,
  "涓嶈鏍囬": "鎴愮墖涓嶅彔鍔犻《閮?AI 鏍囬锛屽彧淇濈暀鍙ｆ挱瀛楀箷銆?,
  "鐥涚偣閽╁瓙鏍囬": "妯℃澘锛氬湪{鍩庡競}锛屽埆鍐嶄负{鐥涚偣}鑺卞啢鏋夐挶銆傞€傚悎鍏堟姄瀹㈡埛姝ｅ湪鎷呭績鐨勯棶棰樸€?,
  "鍙嶅樊鎮康鏍囬": "妯℃澘锛氱湅璧锋潵鏅€氱殑{鏈嶅姟}锛屼负浠€涔坽浜虹兢}閮芥潵锛熼€傚悎鍒堕€犲ソ濂囧拰鍋滅暀銆?,
  "鏁板瓧娓呭崟鏍囬": "妯℃澘锛歿鍩庡競}{浜虹兢}蹇呯湅鐨?涓獅閫夋嫨鏍囧噯}銆傞€傚悎閬垮潙銆佹敹钘忋€佽浆鍙戙€?,
  "鍚屽煄鍦烘櫙鏍囬": "妯℃澘锛歿鍩庡競}{鍦烘櫙}鍚庯紝鎴戝彂鐜皗闂ㄥ簵浠峰€紏銆傞€傚悎鍚屽煄娉涘瀭鐩寸牬鍦堛€?,
  "閬垮潙鎻愰啋鏍囬": "妯℃澘锛氱涓€娆″仛{鏈嶅姟}锛屽厛閬垮紑杩?涓潙銆傞€傚悎鏁欒偛鐢ㄦ埛銆佸缓绔嬩俊浠汇€?,
  "缁撴灉鎵胯鏍囬": "妯℃澘锛氭兂{缁撴灉}锛屽厛鐪嬭繖濂梴鏂规硶/娴佺▼}銆傞€傚悎浠庣粨鏋滃€掓帹鍒版湇鍔°€?,
  "鐪熷疄娴嬭瘎鏍囬": "妯℃澘锛氭垜鐢▄鐪熷疄鍦烘櫙}娴嬩簡涓€涓媨鏈嶅姟}銆傞€傚悎闂ㄥ簵杩囩▼銆佷綋楠屻€佸弽棣堝唴瀹广€?,
  "鍥㈣喘鎴愪氦鏍囬": "妯℃澘锛歿濂楅/浠锋牸}鍊间笉鍊硷紵鐪嬪畬鍐嶅喅瀹氥€傞€傚悎鍥㈠崟銆佸椁愩€佽浆鍖栬棰戙€?
};

const assetTypeLabels = {
  talking_head: "鍙ｆ挱瑙嗛",
  scene: "闂ㄥ簵鐜",
  process: "椤圭洰杩囩▼",
  feedback: "椤惧鍙嶉",
  product: "浜у搧/鍥㈣喘鍥?,
  voice_sample: "澹伴煶鏍锋湰",
  bgm: "BGM 闊充箰",
  image: "鍥剧墖",
  video: "瑙嗛",
  audio: "闊抽",
  document: "鏂囨。",
};

const assetOrder = [
  ["talking_head", "鍙ｆ挱瑙嗛"],
  ["scene", "闂ㄥ簵鐜"],
  ["process", "椤圭洰杩囩▼"],
  ["feedback", "椤惧鍙嶉"],
  ["product", "浜у搧/鍥㈣喘鍥?],
  ["bgm", "BGM 闊充箰"],
];

const cockpitMaterialRows = [
  { type: "talking_head", title: "鍙ｆ挱", subtitle: "鍝佺墝浠嬬粛/璁茶В", missingAction: "涓婁紶" },
  { type: "scene", title: "闂ㄥ簵鐜", subtitle: "闂ㄥご/鍓嶅彴/鐜", missingAction: "涓婁紶" },
  { type: "process", title: "椤圭洰杩囩▼", subtitle: "鎶ょ悊/鎿嶄綔杩囩▼", missingAction: "涓婁紶" },
  { type: "feedback", title: "椤惧鍙嶉", subtitle: "椤惧璇勪环/瑙佽瘉", missingAction: "涓婁紶" },
  { type: "bgm", title: "BGM", subtitle: "鑳屾櫙闊充箰", missingAction: "閫夋嫨闊充箰" },
];

state.assetGroups = [...defaultAssetGroups];

const stepIndexByTab = {
  researchTab: 1,
  scriptTab: 2,
  libraryTab: 1,
  editorTab: 3,
  exportTab: 4,
};

function normalizeList(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  return [value];
}

function toast(message) {
  const el = $("toast");
  el.textContent = message;
  el.classList.remove("hidden");
  setTimeout(() => el.classList.add("hidden"), 2600);
}

function safeJsonBody(body) {
  if (typeof body !== "string") return body;
  return body.replace(/[^\x00-\x7F]/g, (char) => {
    const code = char.charCodeAt(0).toString(16).padStart(4, "0");
    return `\\u${code}`;
  });
}

async function api(path, options = {}) {
  if (staticPreviewMode && path.startsWith("/api/")) {
    return staticPreviewApi(path, options);
  }
  const url = path.startsWith("/api/") && configuredApiBaseUrl ? `${configuredApiBaseUrl}${path}` : path;
  const headers = { ...(options.headers || {}) };
  headers["Content-Type"] = "application/json; charset=utf-8";
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const res = await fetch(url, { ...options, headers, body: safeJsonBody(options.body) });
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw new Error("鍚庣鏈嶅姟鏈繛鎺ワ細璇峰惎鍔ㄦ湇鍔″櫒鍚庡啀鎿嶄綔");
  }
  const data = await res.json();
  if (!res.ok || data.ok === false) {
    throw new Error(data.error || `璇锋眰澶辫触锛?{res.status}`);
  }
  return data;
}

function parseRequestBody(body) {
  if (!body) return {};
  if (typeof body === "string") {
    try { return JSON.parse(body); } catch { return {}; }
  }
  return body;
}

function getStaticPreviewUser(username = "admin") {
  const clean = String(username || "admin").trim() || "admin";
  return {
    id: `static-${clean}`,
    username: clean,
    role: clean === "admin" ? "admin" : "demo",
  };
}

function buildStaticPreviewCopy(payload = {}) {
  const brand = payload.brandName || payload.storeIndustry || "鏈湴闂ㄥ簵";
  const product = payload.mainProduct || "涓绘帹椤圭洰";
  const city = payload.storeCity || "鍚屽煄";
  const title = `${brand}${product}鍒板簵浣撻獙`;
  const strategy = [
    `闈欐€侀瑙堣鏄庯細褰撳墠椤甸潰杩愯鍦?GitHub Pages锛屾病鏈夎繛鎺ュ悗绔拰澶фā鍨嬨€俙,
    `妗ｆ鏂瑰悜锛氬洿缁?{city}鏈湴瀹㈡埛锛岀敤鐪熷疄闂ㄥ簵銆佺湡瀹炴湇鍔¤繃绋嬪拰鐪熷疄鍙嶉寤虹珛淇′换銆俙,
    `鍐呭閲嶇偣锛氬厛璁插鎴风棝鐐癸紝鍐嶅睍绀?{product}鐨勬湇鍔¤繃绋嬶紝鏈€鍚庣粰鍑哄埌搴楃悊鐢便€俙,
    `姝ｅ紡涓婄嚎鍚庯紝杩欓噷浼氱敱鍚庣璋冪敤 DeepSeek/鐧剧偧鐢熸垚瀹屾暣璋冪爺鍜岃剼鏈€俙,
  ].join("\n");
  const script = [
    `寰堝${city}瀹㈡埛绗竴娆￠€夋嫨${brand}锛屾渶鎷呭績鐨勪笉鏄环鏍硷紝鑰屾槸涓嶇煡閬撴晥鏋滈潬涓嶉潬璋便€俙,
    `鎴戜滑浼氬厛鎶婃湇鍔℃祦绋嬭娓呮锛屽啀鎶婄湡瀹炶繃绋嬪拰娉ㄦ剰浜嬮」鎷嶅嚭鏉ャ€俙,
    `${product}閫傚悎鎯冲皯璧板集璺€佸笇鏈涚湅鍒扮湡瀹炰綋楠岀殑浜恒€俙,
    `濡傛灉浣犱篃鍦ㄩ檮杩戯紝鍙互鍏堜簡瑙ｄ竴涓嬶紝鍐嶅喅瀹氳涓嶈鍒板簵銆俙,
  ].join("\n");
  const shotPrompts = [
    `鏂囨锛氬緢澶?{city}瀹㈡埛绗竴娆￠€夋嫨${brand}锛屾渶鎷呭績鐨勪笉鏄环鏍硷紝鑰屾槸涓嶇煡閬撴晥鏋滈潬涓嶉潬璋憋綔鐢婚潰锛氳€佹澘鎴栭棬搴楄礋璐ｄ汉姝ｉ潰鍙ｆ挱锝滅礌鏉愶細鍙ｆ挱瑙嗛`,
    `鏂囨锛氭垜浠細鍏堟妸鏈嶅姟娴佺▼璁叉竻妤氾紝鍐嶆妸鐪熷疄杩囩▼鍜屾敞鎰忎簨椤规媿鍑烘潵锝滅敾闈細闂ㄥ簵鐜鍜屾湇鍔℃祦绋嬬粏鑺傦綔绱犳潗锛氶棬搴?杩囩▼绱犳潗`,
    `鏂囨锛?{product}閫傚悎鎯冲皯璧板集璺€佸笇鏈涚湅鍒扮湡瀹炰綋楠岀殑浜猴綔鐢婚潰锛氶」鐩垚鏋溿€佸椁愭潈鐩婃垨椤惧鍙嶉锝滅礌鏉愶細浜у搧/鍙嶉绱犳潗`,
    `鏂囨锛氬鏋滀綘涔熷湪闄勮繎锛屽彲浠ュ厛浜嗚В涓€涓嬶紝鍐嶅喅瀹氳涓嶈鍒板簵锝滅敾闈細闂ㄥご銆佸湴鍧€銆佸紩瀵煎挩璇㈢敾闈綔绱犳潗锛氶棬搴楃礌鏉恅,
  ];
  return {
    ok: true,
    provider: "github-pages-preview",
    result: {
      taskType: payload.taskType || "script",
      mode: payload.modelMode || "preview",
      model: "static-preview",
      strategy,
      script,
      shotPrompts,
      tags: ["鍚屽煄", "闂ㄥ簵", "鐪熷疄浣撻獙"],
      topicOptions: [
        {
          title,
          reason: "鐢ㄤ簬闈欐€侀瑙堥〉闈㈡祦绋嬶紝姝ｅ紡涓婄嚎鍚庣敱鍚庣澶фā鍨嬬敓鎴愩€?,
          script,
          shotPrompts,
          tags: ["鍚屽煄", "闂ㄥ簵", "鐪熷疄浣撻獙"],
        },
      ],
    },
  };
}

function staticPreviewApi(path, options = {}) {
  const method = String(options.method || "GET").toUpperCase();
  const payload = parseRequestBody(options.body);
  if (path === "/api/auth/login" && method === "POST") {
    const username = String(payload.username || "").trim();
    const password = String(payload.password || "");
    const valid = (username === "admin" && password === "admin123") || (username === "demo01" && password === "demo123");
    if (!valid) throw new Error("璐﹀彿鎴栧瘑鐮侀敊璇?);
    return Promise.resolve({ ok: true, token: `static-preview-${username}`, user: getStaticPreviewUser(username) });
  }
  if (path === "/api/me") {
    return Promise.resolve({ ok: true, user: getStaticPreviewUser(state.token.replace(/^static-preview-/, "") || "admin") });
  }
  if (path === "/api/health") {
    return Promise.resolve({ ok: true, name: "GitHub Pages 闈欐€侀瑙堢増" });
  }
  if (path === "/api/asset-groups" && method === "GET") {
    return Promise.resolve({ ok: true, groups: [...defaultAssetGroups] });
  }
  if (path === "/api/assets" && method === "GET") {
    return Promise.resolve({ ok: true, assets: [] });
  }
  if (path === "/api/voices" && method === "GET") {
    return Promise.resolve({ ok: true, voices: [] });
  }
  if (path === "/api/jobs" && method === "GET") {
    return Promise.resolve({ ok: true, jobs: [] });
  }
  if (path === "/api/copy/rewrite" && method === "POST") {
    return Promise.resolve(buildStaticPreviewCopy(payload));
  }
  throw new Error(staticPreviewMessage);
}

function showApp() {
  $("loginView").classList.add("hidden");
  $("appView").classList.remove("hidden");
  applySidebarState();
}

function showLogin() {
  $("loginView").classList.remove("hidden");
  $("appView").classList.add("hidden");
}

function getWorkspaceDraftKey() {
  const userKey = state.user?.id || state.user?.username || "anonymous";
  return `aivf_workspace_draft_v${workspaceDraftVersion}_${userKey}`;
}

function getFieldValueForDraft(field) {
  if (!field || workspaceDraftExcludedIds.has(field.id)) return undefined;
  if (field.type === "checkbox") return Boolean(field.checked);
  if (field.type === "file" || field.type === "password") return undefined;
  return field.value ?? "";
}

function setFieldValueFromDraft(id, value) {
  const field = $(id);
  if (!field || value === undefined || workspaceDraftExcludedIds.has(id)) return;
  if (field.type === "checkbox") {
    field.checked = Boolean(value);
    return;
  }
  if (field.type === "file" || field.type === "password") return;
  field.value = value ?? "";
}

function collectWorkspaceDraft() {
  const fields = {};
  workspaceDraftFieldIds.forEach((id) => {
    const value = getFieldValueForDraft($(id));
    if (value !== undefined) fields[id] = value;
  });
  return {
    version: workspaceDraftVersion,
    savedAt: new Date().toISOString(),
    activeTemplateCategory: state.activeTemplateCategory,
    activeAssetGroupId: state.activeAssetGroupId,
    selectedTopicIndex: state.selectedTopicIndex,
    scriptTopicOptions: state.scriptTopicOptions || [],
    shots: state.shots || [],
    lastResearch: state.lastResearch || null,
    lastRender: state.lastRender || null,
    scriptDossierState: $("scriptDossierState")?.textContent || "",
    modelBadge: $("modelBadge")?.textContent || "",
    exportStatus: $("exportStatus")?.textContent || "",
    localAudienceSegments: Array.from(document.querySelectorAll('input[name="localAudienceSegmentOption"]:checked')).map((box) => box.value),
    fields,
  };
}

function saveWorkspaceDraftNow() {
  if (isRestoringWorkspaceDraft || !state.user) return;
  try {
    localStorage.setItem(getWorkspaceDraftKey(), JSON.stringify(collectWorkspaceDraft()));
  } catch (error) {
    console.warn("workspace_draft_save_failed", error);
  }
}

function scheduleWorkspaceDraftSave() {
  if (isRestoringWorkspaceDraft || !state.user) return;
  clearTimeout(workspaceDraftTimer);
  workspaceDraftTimer = setTimeout(saveWorkspaceDraftNow, 250);
}

function restoreWorkspaceDraft() {
  if (!state.user) return;
  let draft = null;
  try {
    draft = JSON.parse(localStorage.getItem(getWorkspaceDraftKey()) || "null");
  } catch {
    draft = null;
  }
  if (!draft || draft.version !== workspaceDraftVersion) return;
  isRestoringWorkspaceDraft = true;
  try {
    state.activeTemplateCategory = draft.activeTemplateCategory || state.activeTemplateCategory;
    state.activeAssetGroupId = draft.activeAssetGroupId || state.activeAssetGroupId;
    state.selectedTopicIndex = Number.isFinite(Number(draft.selectedTopicIndex)) ? Number(draft.selectedTopicIndex) : 0;
    state.scriptTopicOptions = Array.isArray(draft.scriptTopicOptions) ? draft.scriptTopicOptions : [];
    state.shots = Array.isArray(draft.shots) ? draft.shots.map(normalizeShot) : [];
    state.lastResearch = draft.lastResearch || null;
    state.lastRender = draft.lastRender || state.lastRender;
    renderTemplateTabs();
    renderTemplateSelect();
    updateScriptSeriesFields();
    if (draft.fields) {
      Object.entries(draft.fields).forEach(([id, value]) => setFieldValueFromDraft(id, value));
    }
    if (Array.isArray(draft.localAudienceSegments)) {
      document.querySelectorAll('input[name="localAudienceSegmentOption"]').forEach((box) => {
        box.checked = draft.localAudienceSegments.includes(box.value);
      });
      syncLocalAudienceSelections();
    }
    if ($("scriptDossierState") && draft.scriptDossierState) $("scriptDossierState").textContent = draft.scriptDossierState;
    if ($("modelBadge") && draft.modelBadge) $("modelBadge").textContent = draft.modelBadge;
    if ($("exportStatus") && draft.exportStatus) $("exportStatus").textContent = draft.exportStatus;
    renderTopicIdeas(state.scriptTopicOptions);
    renderTopicChoiceBar();
    if (state.shots.length) {
      renderShotTable();
      renderMixPlan();
    } else {
      clearShotTableView();
    }
    renderLatestExport();
    if (state.shots.length) renderCockpit();
  } finally {
    isRestoringWorkspaceDraft = false;
  }
}

function clearCurrentWorkspaceDraft() {
  if (!state.user) return;
  localStorage.removeItem(getWorkspaceDraftKey());
}

function switchTab(tabId) {
  document.querySelectorAll(".nav").forEach((b) => {
    const tabs = (b.dataset.tabs || b.dataset.tab || "").split(/\s+/).filter(Boolean);
    b.classList.toggle("active", tabs.includes(tabId));
  });
  document.querySelectorAll(".nav-segment").forEach((b) => b.classList.toggle("active", b.dataset.tab === tabId));
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.id === tabId));
  updateWorkspaceHeader(tabId);
  if (tabId === "libraryTab") {
    loadAssetGroups().then(() => loadAssets()).catch((e) => toast(e.message));
    loadVoices().catch((e) => toast(e.message));
  }
  if (tabId === "editorTab") {
    loadAssets().then(() => {
      if (state.shots.length) {
        renderShotTable();
        renderMixPlan();
        renderEditorMaterialNotice();
      } else {
        clearShotTableView();
      }
    }).catch((e) => toast(e.message));
    loadVoices().then(() => {
      if (state.shots.length) renderEditorMaterialNotice();
    }).catch((e) => toast(e.message));
    if (state.shots.length) {
      renderShotTable();
      renderMixPlan();
      renderEditorMaterialNotice();
    } else {
      clearShotTableView();
    }
  }
  if (tabId === "exportTab") {
    loadVoices().catch((e) => toast(e.message));
    loadJobs().catch((e) => toast(e.message));
    syncExportFields();
  }
  renderCockpit();
}

function updateWorkspaceHeader(tabId) {
  const copy = workspaceCopy[tabId] || workspaceCopy.researchTab;
  if ($("workspaceTitle")) $("workspaceTitle").textContent = copy.title;
  if ($("workspaceSubtitle")) $("workspaceSubtitle").textContent = copy.subtitle;
}

function bindTabs() {
  document.querySelectorAll(".nav[data-tab], .nav-segment[data-tab]").forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });
  requiredDossierFields.forEach(([id]) => {
    const field = $(id);
    if (!field) return;
    field.addEventListener("input", () => field.classList.remove("field-missing"));
    field.addEventListener("change", () => field.classList.remove("field-missing"));
  });
  ["scriptDossier", "localAudienceSegment", "localAgeRange"].forEach((id) => {
    const field = $(id);
    if (!field) return;
    field.addEventListener("input", () => field.classList.remove("field-missing"));
    field.addEventListener("change", () => field.classList.remove("field-missing"));
  });
  document.querySelectorAll('input[name="localAudienceSegmentOption"]').forEach((field) => {
    field.addEventListener("change", () => syncLocalAudienceSelections(field));
  });
  $("localAudienceToggle")?.addEventListener("click", (event) => {
    event.stopPropagation();
    setLocalAudienceMenu();
  });
  $("localAudienceSelect")?.addEventListener("click", (event) => event.stopPropagation());
  document.addEventListener("click", () => setLocalAudienceMenu(false));
}

function applySidebarState() {
  const app = $("appView");
  const toggle = $("sidebarToggle");
  if (!app || !toggle) return;
  app.classList.toggle("sidebar-collapsed", state.sidebarCollapsed);
  toggle.setAttribute("aria-expanded", String(!state.sidebarCollapsed));
  toggle.setAttribute("aria-label", state.sidebarCollapsed ? "灞曞紑渚ц竟鏍? : "鏀惰捣渚ц竟鏍?);
  toggle.textContent = state.sidebarCollapsed ? "鈥? : "鈥?;
}

function toggleSidebar() {
  state.sidebarCollapsed = !state.sidebarCollapsed;
  localStorage.setItem("aivf_sidebar_collapsed", state.sidebarCollapsed ? "1" : "0");
  applySidebarState();
}

async function login() {
  $("loginError").textContent = "";
  try {
    const data = await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({
        username: $("loginUsername").value.trim(),
        password: $("loginPassword").value,
      }),
    });
    state.token = data.token;
    state.user = data.user;
    localStorage.setItem("aivf_token", state.token);
    $("accountName").textContent = `${data.user.username} / ${data.user.role}`;
    showApp();
    await bootstrap();
  } catch (err) {
    $("loginError").textContent = err.message;
  }
}

async function bootstrap() {
  renderTemplateTabs();
  renderTemplateSelect();
  await checkHealth();
  await loadAssetGroups();
  await Promise.all([loadAssets(), loadVoices(), loadJobs()]);
  restoreWorkspaceDraft();
  if (state.shots.length) {
    renderShotTable();
    renderMixPlan();
    renderCockpit();
  } else {
    clearShotTableView();
  }
}

async function checkHealth() {
  try {
    const data = await api("/api/health");
    if ($("healthPill")) $("healthPill").textContent = `${data.name} 宸茶繛鎺;
  } catch {
    if ($("healthPill")) $("healthPill").textContent = "鏈嶅姟杩炴帴澶辫触";
  }
}

async function restoreSession() {
  renderTemplateTabs();
  renderTemplateSelect();
  if (!state.token) {
    showLogin();
    return;
  }
  try {
    const data = await api("/api/me");
    state.user = data.user;
    $("accountName").textContent = `${data.user.username} / ${data.user.role}`;
    showApp();
    await bootstrap();
  } catch {
    localStorage.removeItem("aivf_token");
    state.token = "";
    showLogin();
  }
}

function collectBrief() {
  const dossier = {
    storeIndustry: $("storeIndustry")?.value.trim() || "",
    brandName: $("brandName")?.value.trim() || "",
    storeCity: $("storeCity")?.value.trim() || "",
    storeLocation: $("storeLocation")?.value.trim() || "",
    personaName: $("personaName")?.value.trim() || "",
    personaAge: $("personaAge")?.value.trim() || "",
    personaGender: $("personaGender")?.value.trim() || "",
    businessYears: $("businessYears")?.value.trim() || "",
    hometown: $("hometown")?.value.trim() || "",
    mainProduct: $("mainProduct")?.value.trim() || "",
    serviceAdvantage: $("serviceAdvantage")?.value.trim() || "",
    extraInfo: $("extraInfo")?.value.trim() || "",
  };
  const storeProfile = [
    `琛屼笟锛?{dossier.storeIndustry}`,
    `搴楀悕/鍝佺墝锛?{dossier.brandName}`,
    `鍩庡競锛?{dossier.storeCity}`,
    `浣嶇疆锛?{dossier.storeLocation}`,
  ].filter((item) => !item.endsWith("锛?)).join("\n");
  const personaProfile = [
    `鑷垜绉板懠锛?{dossier.personaName}`,
    `骞撮緞锛?{dossier.personaAge}`,
    `鎬у埆锛?{dossier.personaGender}`,
    `浠庝笟/寮€搴楀勾闄愶細${dossier.businessYears}`,
    `绫嶈疮/鍦板煙韬唤锛?{dossier.hometown}`,
  ].filter((item) => !item.endsWith("锛?)).join("\n");
  const optionalProfile = [
    `涓绘帹浜у搧/濂楅锛?{dossier.mainProduct}`,
    `浜у搧/鏈嶅姟浼樺娍锛?{dossier.serviceAdvantage}`,
    `琛ュ厖淇℃伅锛?{dossier.extraInfo}`,
  ].filter((item) => !item.endsWith("锛?)).join("\n");
  return {
    taskType: "research",
    ...dossier,
    background: personaProfile,
    pain: dossier.extraInfo,
    goal: dossier.mainProduct,
    rawText: storeProfile,
    targetAudience: [dossier.storeCity, dossier.storeLocation].filter(Boolean).join(" 路 "),
    assetCondition: optionalProfile,
    modelMode: $("modelMode")?.value || "fast",
    style: state.activeTemplateCategory,
    template: getSelectedTemplate()?.content || "",
  };
}

function buildDossierText(brief, includeAiResearch = true) {
  const sections = [
    `闂ㄥ簵鍩烘湰淇℃伅
琛屼笟锛?{brief.storeIndustry || "鏈～鍐?}
搴楀悕/鍝佺墝锛?{brief.brandName || "鏈～鍐?}
鍩庡競锛?{brief.storeCity || "鏈～鍐?}
浣嶇疆锛?{brief.storeLocation || "鏈～鍐?}`,
    `浜鸿鍩烘湰淇℃伅
鐭棰戣嚜鎴戠О鍛硷細${brief.personaName || "鏈～鍐?}
骞撮緞锛?{brief.personaAge || "鏈～鍐?}
鎬у埆锛?{brief.personaGender || "鏈～鍐?}
琛屼笟/闂ㄥ簵骞撮檺锛?{brief.businessYears || "鏈～鍐?}
绫嶈疮/鍦板煙韬唤锛?{brief.hometown || "鏈～鍐?}`,
    `琛ュ厖淇℃伅
涓绘帹浜у搧/濂楅锛?{brief.mainProduct || "鏈～鍐?}
浜у搧/鏈嶅姟浼樺娍锛?{brief.serviceAdvantage || "鏈～鍐?}
鍏朵粬琛ュ厖锛?{brief.extraInfo || "鏈～鍐?}`,
  ];
  const aiResearch = $("resultStrategy")?.value.trim();
  if (includeAiResearch && aiResearch) {
    sections.push(`AI 璋冪爺缁撴灉\n${aiResearch}`);
  }
  return sections.join("\n\n");
}

function hasBrief(brief) {
  return Boolean(brief.storeIndustry || brief.brandName || brief.storeCity || brief.personaName || brief.background || brief.rawText);
}

function validateResearchDossier() {
  const missing = [];
  requiredDossierFields.forEach(([id, label]) => {
    const field = $(id);
    const value = field?.value?.trim() || "";
    field?.classList.toggle("field-missing", !value);
    if (!value) missing.push({ id, label, field });
  });
  if (missing.length) {
    missing[0].field?.focus();
    toast(`璇峰厛琛ュ叏蹇呭～椤癸細${missing.slice(0, 3).map((item) => item.label).join("銆?)}${missing.length > 3 ? "绛? : ""}`);
    return false;
  }
  return true;
}

function getResearchRegenerateRecord() {
  const now = Date.now();
  let record = null;
  try {
    record = JSON.parse(localStorage.getItem(researchRegenerateStorageKey) || "null");
  } catch {
    record = null;
  }
  if (!record || !Number.isFinite(record.startedAt) || now - record.startedAt >= researchRegenerateWindowMs) {
    record = { startedAt: now, count: 0 };
  }
  return record;
}

function formatCooldown(ms) {
  const seconds = Math.max(1, Math.ceil(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes <= 0) return `${rest} 绉抈;
  return rest ? `${minutes} 鍒?${rest} 绉抈 : `${minutes} 鍒嗛挓`;
}

function claimResearchGenerationSlot() {
  const now = Date.now();
  const record = getResearchRegenerateRecord();
  const elapsed = now - record.startedAt;
  if (record.count >= researchRegenerateLimit && elapsed < researchRegenerateWindowMs) {
    return {
      ok: false,
      waitText: formatCooldown(researchRegenerateWindowMs - elapsed),
    };
  }
  record.count += 1;
  localStorage.setItem(researchRegenerateStorageKey, JSON.stringify(record));
  return {
    ok: true,
    remaining: Math.max(0, researchRegenerateLimit - record.count),
  };
}

function importResearchDossier() {
  const brief = collectBrief();
  if (!validateResearchDossier()) return false;
  const dossierText = buildDossierText(brief, true);
  $("scriptDossier").value = dossierText;
  $("scriptDossierState").textContent = $("resultStrategy").value.trim() ? "宸插鍏ヨ皟鐮旀。妗堝簱" : "宸插鍏ュ熀纭€妗ｆ搴?;
  $("scriptDossier").classList.remove("field-missing");
  document.querySelector(".dossier-mini")?.classList.remove("field-missing");
  resetScriptGenerationDraft();
  toast("璋冪爺妗ｆ搴撳凡瀵煎叆鑴氭湰妯″潡");
  scheduleWorkspaceDraftSave();
  return true;
}

function resetScriptGenerationDraft() {
  state.scriptTopicOptions = [];
  state.selectedTopicIndex = 0;
  state.shots = [];
  ["scriptTopicIdeas", "resultTitle", "resultTags", "resultScript", "resultPrompts", "ttsText", "videoTitle", "videoScript"].forEach((id) => {
    const field = $(id);
    if (field) field.value = "";
  });
  if ($("scriptDossierState")) $("scriptDossierState").textContent = $("resultStrategy").value.trim()
    ? "宸插鍏ヨ皟鐮旀。妗堝簱锛岀瓑寰呯敓鎴愯剼鏈?
    : "宸插鍏ュ熀纭€妗ｆ搴擄紝绛夊緟鐢熸垚鑴氭湰";
  if ($("scriptTopicIdeas")) $("scriptTopicIdeas").placeholder = "宸插鍏ユ。妗堛€傜偣鍑讳笅鏂规寜閽悗锛孌eepSeek 浼氬厛鎬濊€冿紝鍐嶇敓鎴愬彲閫夐€夐銆?;
  if ($("resultScript")) $("resultScript").placeholder = "杩欓噷涓嶄細鑷姩濂楁ā鏉匡紱鐢熸垚鍚庢墠浼氬嚭鐜板彲鐩存帴鐓х潃蹇电殑鍙ｆ挱鏂囨銆?;
  if ($("resultPrompts")) $("resultPrompts").placeholder = "鐢熸垚鍚庝細鎸夊悓涓€闀滃ご鍖归厤锛氬彛鎾枃妗堛€佹媿鎽勫満鏅?鍔ㄤ綔銆侀渶瑕佺礌鏉愩€?;
  renderTopicIdeas([]);
  renderTopicChoiceBar();
  clearShotTableView();
  renderCockpit();
}

function updateScriptSeriesFields() {
  const isLocal = state.activeTemplateCategory === "鍚屽煄鐭棰?;
  $("localTargetPanel")?.classList.toggle("hidden", !isLocal);
  if (!isLocal) setLocalAudienceMenu(false);
  if (isLocal) syncLocalAudienceSelections();
}

function setLocalAudienceMenu(forceOpen = null) {
  const menu = $("localAudienceSegmentGroup");
  const toggle = $("localAudienceToggle");
  if (!menu || !toggle) return;
  const shouldOpen = typeof forceOpen === "boolean" ? forceOpen : menu.classList.contains("hidden");
  menu.classList.toggle("hidden", !shouldOpen);
  toggle.setAttribute("aria-expanded", String(shouldOpen));
}

function updateLocalAudienceSummary(selected) {
  const summary = $("localAudienceSummary");
  if (!summary) return;
  if (!selected.length) {
    summary.textContent = "璇烽€夋嫨浜虹兢";
    return;
  }
  if (selected.includes("浜虹兢涓嶉檺")) {
    summary.textContent = "浜虹兢涓嶉檺";
    return;
  }
  const preview = selected.slice(0, 2).join("銆?);
  summary.textContent = selected.length > 2 ? `宸查€?${selected.length} 椤癸細${preview} 绛塦 : `宸查€?${selected.length} 椤癸細${preview}`;
}

function syncLocalAudienceSelections(changedField = null) {
  const boxes = Array.from(document.querySelectorAll('input[name="localAudienceSegmentOption"]'));
  if (!boxes.length) return;
  const unlimited = boxes.find((box) => box.value === "浜虹兢涓嶉檺");
  if (changedField?.value === "浜虹兢涓嶉檺" && changedField.checked) {
    boxes.forEach((box) => {
      if (box !== changedField) box.checked = false;
    });
  } else if (changedField?.checked && unlimited) {
    unlimited.checked = false;
  }
  const selected = boxes.filter((box) => box.checked).map((box) => box.value);
  if ($("localAudienceSegment")) {
    $("localAudienceSegment").value = selected.join("銆?);
    $("localAudienceSegment").classList.remove("field-missing");
  }
  $("localAudienceSegmentGroup")?.classList.remove("field-missing");
  $("localAudienceSelect")?.classList.remove("field-missing");
  document.querySelectorAll(".choice-chip").forEach((chip) => {
    const input = chip.querySelector("input");
    chip.classList.toggle("selected", Boolean(input?.checked));
  });
  updateLocalAudienceSummary(selected);
  const ageValue = deriveAgeRangeFromSegments(selected);
  if ($("localAgeRange")) {
    $("localAgeRange").value = ageValue;
    $("localAgeRange").classList.remove("field-missing");
  }
}

function deriveAgeRangeFromSegments(selected) {
  if (!selected.length) return "";
  if (selected.includes("浜虹兢涓嶉檺")) return "涓嶉檺";
  const ranges = selected.map((name) => localAudienceAgeMap[name]).filter(Boolean);
  if (!ranges.length) return "";
  const hasOpenEnded = ranges.some((range) => range.max === null);
  const mins = ranges.map((range) => range.min).filter((value) => Number.isFinite(value));
  const maxes = ranges.map((range) => range.max).filter((value) => Number.isFinite(value));
  if (!mins.length) return "涓嶉檺";
  const min = Math.min(...mins);
  if (hasOpenEnded) return `${min} 宀佷互涓奰;
  return `${min}-${Math.max(...maxes)} 宀乣;
}

function validateScriptInputs() {
  const missing = [];
  const dossier = $("scriptDossier");
  if (!dossier.value.trim()) {
    document.querySelector(".dossier-mini")?.classList.add("field-missing");
    missing.push({ field: $("importDossierBtn"), label: "璋冪爺妗ｆ" });
  }
  if (state.activeTemplateCategory === "鍚屽煄鐭棰?) {
    const audienceValue = $("localAudienceSegment")?.value?.trim() || "";
    $("localAudienceSelect")?.classList.toggle("field-missing", !audienceValue);
    if (!audienceValue) {
      setLocalAudienceMenu(true);
      missing.push({ field: $("localAudienceToggle"), label: "鍚屽煄浜虹兢" });
    }
    const ageField = $("localAgeRange");
    const ageValue = ageField?.value?.trim() || "";
    ageField?.classList.toggle("field-missing", !ageValue);
    if (!ageValue) missing.push({ field: ageField, label: "骞撮緞鑼冨洿" });
  }
  if (missing.length) {
    missing[0].field?.focus();
    toast(`璇峰厛琛ュ叏鑴氭湰蹇呭～椤癸細${missing.map((item) => item.label).join("銆?)}`);
    return false;
  }
  return true;
}

async function generateResearch(autoJump = false) {
  const brief = collectBrief();
  if (!validateResearchDossier()) {
    return;
  }
  const slot = claimResearchGenerationSlot();
  if (!slot.ok) {
    toast(`杩炵画鐢熸垚宸茶揪 3 娆★紝璇?${slot.waitText} 鍚庡啀璇昤);
    return;
  }
  let success = false;
  $("resultStrategy").value = "";
  setResearchLoading(true, brief.modelMode);
  try {
    const data = await api("/api/copy/rewrite", {
      method: "POST",
      body: JSON.stringify({ ...brief, taskType: "research" }),
    });
    applyAiResult(data, "research");
    success = true;
    toast(data.provider === "deepseek" ? "DeepSeek 宸插畬鎴愪釜浜鸿皟鐮斿畾浣? : "宸茬敓鎴愭湰鍦颁釜浜鸿皟鐮斿畾浣?);
    if (autoJump) switchTab("scriptTab");
  } finally {
    setResearchLoading(false, brief.modelMode, success);
  }
}

async function generateScript() {
  const brief = collectBrief();
  const tpl = getSelectedTemplate();
  const payload = {
    ...brief,
    taskType: "script",
    style: state.activeTemplateCategory,
    template: tpl?.content || "",
    researchProfile: $("scriptDossier").value.trim(),
    localAudienceSegment: $("localAudienceSegment")?.value.trim() || "",
    localAgeRange: $("localAgeRange")?.value.trim() || "",
    titleStyle: $("scriptTitleStyle")?.value || "鏅鸿兘鎺ㄨ崘鏍峰紡",
    title_style: $("scriptTitleStyle")?.value || "鏅鸿兘鎺ㄨ崘鏍峰紡",
    titleTemplateHint: getTitleTemplateHint($("scriptTitleStyle")?.value || "鏅鸿兘鎺ㄨ崘鏍峰紡"),
    modelMode: $("scriptModelMode")?.value || "fast",
  };
  if (!validateScriptInputs()) {
    return;
  }
  let success = false;
  $("scriptBtn").classList.add("is-loading");
  $("scriptBtn").textContent = "姝ｅ湪鐢熸垚鏂囨 + 鍒嗛暅...";
  setScriptLoading(true, payload.modelMode);
  try {
    const data = await api("/api/copy/rewrite", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    applyAiResult(data, "script");
    success = true;
    toast(`${state.activeTemplateCategory} 宸茬敓鎴恅);
    switchTab("scriptTab");
  } finally {
    $("scriptBtn").classList.remove("is-loading");
    $("scriptBtn").textContent = "鐢?DeepSeek 鐢熸垚鏂囨 + 鍒嗛暅";
    setScriptLoading(false, payload.modelMode, success);
  }
}

function setScriptLoading(isLoading, mode, success = true) {
  const line = $("scriptLoading");
  const text = $("scriptLoadingText");
  line?.classList.toggle("hidden", !isLoading);
  if (text) {
    text.textContent = mode === "thinking"
      ? "鎬濊€冩ā鍨嬫鍦ㄧ粨鍚堟。妗堛€佷汉缇ゅ拰鍐呭绯诲垪鐢熸垚锛岃绋嶇瓑..."
      : "姝ｅ湪蹇€熺敓鎴愰€夐銆佹枃妗堝拰鍒嗛暅...";
  }
  if (isLoading) {
    startGenerationProgress("script", mode);
  } else {
    finishGenerationProgress("script", success);
  }
}

function setResearchLoading(isLoading, mode, success = true) {
  const line = $("researchLoading");
  const text = $("researchLoadingText");
  const btn = $("researchBtn");
  if (!line || !btn) return;
  line.classList.toggle("hidden", !isLoading);
  btn.classList.toggle("is-loading", isLoading);
  btn.disabled = isLoading;
  if (text) {
    text.textContent = mode === "thinking"
      ? "鎬濊€冩ā鍨嬫鍦ㄦ繁搴﹀垎鏋愪釜浜哄畾浣嶏紝璇风◢绛?.."
      : "姝ｅ湪蹇€熺敓鎴愪釜浜鸿皟鐮斿畾浣?..";
  }
  $("modelBadge").textContent = isLoading ? (mode === "thinking" ? "鎬濊€冩ā鍨嬬敓鎴愪腑..." : "蹇€熸ā鍨嬬敓鎴愪腑...") : $("modelBadge").textContent;
  if (isLoading) {
    startGenerationProgress("research", mode);
  } else {
    finishGenerationProgress("research", success);
  }
}

const generationProgressConfig = {
  research: {
    panel: "researchProgress",
    bar: "researchProgressBar",
    percent: "researchProgressPercent",
    step: "researchProgressStep",
    steps: "researchProgressSteps",
    doneText: "璋冪爺缁撴灉宸茬敓鎴愶紝姝ｅ湪鍐欏叆妗ｆ缂撳瓨",
    errorText: "鐢熸垚涓柇锛岃妫€鏌ュ繀濉」鎴栫◢鍚庨噸璇?,
    fastSteps: ["璇诲彇闂ㄥ簵妗ｆ", "鍒嗘瀽浜鸿瀹氫綅", "鐢熸垚璋冪爺缁撴灉", "鍐欏叆妗ｆ缂撳瓨"],
    thinkingSteps: ["璇诲彇闂ㄥ簵妗ｆ", "娣卞害鍒嗘瀽瀹氫綅", "鏍″噯琛ㄨ揪绛栫暐", "鍐欏叆妗ｆ缂撳瓨"],
  },
  script: {
    panel: "scriptProgressPanel",
    bar: "scriptProgressBar",
    percent: "scriptProgressPercent",
    step: "scriptProgressStep",
    steps: "scriptProgressSteps",
    doneText: "鏂囨鍜屽垎闀滃凡鐢熸垚锛屾鍦ㄥ悓姝ュ埌鍓緫闀滃ご",
    errorText: "鐢熸垚涓柇锛岃妫€鏌ユ。妗堛€佷汉缇ゆ垨绋嶅悗閲嶈瘯",
    fastSteps: ["瀵煎叆璋冪爺妗ｆ", "鐢熸垚閫夐鏂瑰悜", "杈撳嚭鏂囨鍐呭", "鍚屾鍒嗛暅缂撳瓨"],
    thinkingSteps: ["瀵煎叆璋冪爺妗ｆ", "鎺ㄦ紨鍐呭閫昏緫", "鐢熸垚鏂囨鍒嗛暅", "鍚屾鍓緫缂撳瓨"],
  },
};

function startGenerationProgress(type, mode = "fast") {
  const config = generationProgressConfig[type];
  if (!config) return;
  clearGenerationProgress(type);
  const panel = $(config.panel);
  const bar = $(config.bar);
  const percent = $(config.percent);
  const step = $(config.step);
  const stepsBox = $(config.steps);
  if (!panel || !bar || !percent || !step || !stepsBox) return;
  const steps = mode === "thinking" ? config.thinkingSteps : config.fastSteps;
  panel.classList.remove("hidden", "is-error");
  stepsBox.innerHTML = steps.map((item, index) => `<span class="progress-step ${index === 0 ? "active" : ""}">${escapeHtml(item)}</span>`).join("");
  let value = mode === "thinking" ? 6 : 12;
  renderGenerationProgress(config, steps, value);
  const speed = mode === "thinking" ? 1150 : 720;
  state.progressTimers[type] = setInterval(() => {
    const ceiling = mode === "thinking" ? 92 : 88;
    const bump = mode === "thinking" ? Math.random() * 8 + 2 : Math.random() * 13 + 4;
    value = Math.min(ceiling, value + bump);
    renderGenerationProgress(config, steps, value);
  }, speed);
}

function renderGenerationProgress(config, steps, value) {
  const bar = $(config.bar);
  const percent = $(config.percent);
  const step = $(config.step);
  const stepsBox = $(config.steps);
  const safeValue = Math.max(0, Math.min(100, Math.round(value)));
  if (bar) bar.style.width = `${safeValue}%`;
  if (percent) percent.textContent = `${safeValue}%`;
  const activeIndex = Math.min(steps.length - 1, Math.floor((safeValue / 100) * steps.length));
  if (step) step.textContent = steps[activeIndex] || steps[steps.length - 1];
  if (stepsBox) {
    [...stepsBox.querySelectorAll(".progress-step")].forEach((el, index) => {
      el.classList.toggle("done", index < activeIndex);
      el.classList.toggle("active", index === activeIndex);
    });
  }
}

function finishGenerationProgress(type, success = true) {
  const config = generationProgressConfig[type];
  if (!config) return;
  clearGenerationProgress(type);
  const panel = $(config.panel);
  const bar = $(config.bar);
  const percent = $(config.percent);
  const step = $(config.step);
  const stepsBox = $(config.steps);
  if (!panel || panel.classList.contains("hidden")) return;
  panel.classList.toggle("is-error", !success);
  if (bar) bar.style.width = success ? "100%" : "100%";
  if (percent) percent.textContent = success ? "100%" : "澶辫触";
  if (step) step.textContent = success ? config.doneText : config.errorText;
  if (stepsBox) {
    [...stepsBox.querySelectorAll(".progress-step")].forEach((el) => {
      el.classList.toggle("done", success);
      el.classList.remove("active");
    });
  }
  if (success) {
    setTimeout(() => panel.classList.add("hidden"), 900);
  }
}

function clearGenerationProgress(type) {
  if (state.progressTimers[type]) {
    clearInterval(state.progressTimers[type]);
    delete state.progressTimers[type];
  }
}

function startEditProgress() {
  stopEditProgress(false);
  const overlay = $("editProgressOverlay");
  const bar = $("editProgressBar");
  const text = $("editProgressText");
  const steps = Array.from($("editProgressSteps")?.querySelectorAll("em") || []);
  if (!overlay || !bar) return;
  overlay.classList.remove("hidden");
  let value = 8;
  const messages = [
    "姝ｅ湪鐢熸垚鍏嬮殕閰嶉煶锛岃鍙ｆ挱鍜岄暅澶存椂闂村榻愩€?,
    "姝ｅ湪鍖归厤瑙嗛搴撶礌鏉愶紝鎶婂垎闀滆浆鎹㈡垚鐢婚潰娈佃惤銆?,
    "姝ｅ湪鍚堟垚瀛楀箷銆佹爣棰樺拰 BGM銆?,
    "姝ｅ湪鍐欏叆鎴愬搧搴撳瓨锛岄┈涓婂彲浠ラ瑙堜笅杞姐€?,
  ];
  const render = () => {
    const safeValue = Math.max(0, Math.min(96, Math.round(value)));
    bar.style.width = `${safeValue}%`;
    const activeIndex = Math.min(steps.length - 1, Math.floor((safeValue / 100) * steps.length));
    if (text) text.textContent = messages[activeIndex] || messages[messages.length - 1];
    steps.forEach((step, index) => {
      step.classList.toggle("active", index === activeIndex);
    });
  };
  render();
  editProgressTimer = setInterval(() => {
    value = Math.min(96, value + Math.random() * 10 + 4);
    render();
  }, 700);
}

function stopEditProgress(success = true) {
  if (editProgressTimer) {
    clearInterval(editProgressTimer);
    editProgressTimer = null;
  }
  const overlay = $("editProgressOverlay");
  const bar = $("editProgressBar");
  const text = $("editProgressText");
  if (!overlay) return;
  if (success) {
    if (bar) bar.style.width = "100%";
    if (text) text.textContent = "鎴愮墖宸茬敓鎴愶紝姝ｅ湪鎵撳紑鎴愬搧搴撳瓨銆?;
    setTimeout(() => overlay.classList.add("hidden"), 900);
  } else {
    overlay.classList.add("hidden");
    if (bar) bar.style.width = "8%";
  }
}

function normalizeStringList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => {
      if (typeof item === "string") return item;
      if (item && typeof item === "object") return item.text || item.prompt || item.content || item.title || "";
      return "";
    }).map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value.split(/\n+/).map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

function cleanTopicTitle(value) {
  return String(value || "")
    .replace(/^[-*鈼廫s]*/, "")
    .replace(/^(?:閫夐\s*)?(?:[涓€浜屼笁鍥涗簲鍏竷鍏節鍗乚|\d+)[\.銆乗):锛歕s-]*/i, "")
    .replace(/^(?:鏍囬|棰樼洰|涓婚€夐)[:锛歖\s*/, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 42);
}

function cleanTopicReason(value) {
  const text = String(value || "")
    .replace(/\s+/g, " ")
    .replace(/^(?:鐞嗙敱|浜烘€х偣|鎯呯华鍏ュ彛|浜虹兢鍖归厤|閫昏緫)[:锛歖\s*/, "")
    .trim();
  if (!text) return "缁撳悎褰撳墠妗ｆ鐢熸垚锛岄€傚悎鐩存帴杩涘叆鏂囨鍜屽垎闀溿€?;
  return text.length > 92 ? `${text.slice(0, 92)}...` : text;
}

function parseTopicOptionsFromStrategy(strategy) {
  const lines = String(strategy || "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const options = [];
  lines.forEach((line) => {
    if (/^(閫夐鏂瑰悜|搴曞眰鍒ゆ柇|鎺ㄨ崘閲囩敤|璋冪爺瀹氫綅|闂ㄥ簵妗ｆ|浜鸿妗ｆ|妯″瀷妯″紡|杈撳嚭瑕佹眰)[:锛歖/.test(line)) return;
    const match = line.match(/^(?:閫夐\s*)?([涓€浜屼笁鍥涗簲鍏竷鍏節鍗乚|\d+)[\.銆乗):锛歕s-]+(.+)$/i);
    if (!match) return;
    const body = match[2].trim();
    if (!body || /^(搴曞眰鍒ゆ柇|鎺ㄨ崘閲囩敤|璋冪爺瀹氫綅|闂ㄥ簵妗ｆ|浜鸿妗ｆ)/.test(body)) return;
    const titleMatch = body.match(/(?:鏍囬|閫夐)[:锛歖\s*([^锛?銆俔+)/);
    const title = cleanTopicTitle(titleMatch ? titleMatch[1] : body.split(/[锛?銆俔/)[0]);
    if (!title) return;
    const reason = cleanTopicReason(body.replace(title, "").replace(/^[锛?銆?\s]+/, ""));
    options.push({ title, reason });
  });
  return options;
}

function stripSpokenLine(line) {
  return String(line || "")
    .replace(/^[-*鈼廫s]*/, "")
    .replace(/^闀滃ご\s*(?:\d+|[涓€浜屼笁鍥涗簲鍏竷鍏節鍗乚+)[:锛氥€? ]*/i, "")
    .replace(/^(?:鏂囨|鍙ｆ挱|鍙拌瘝|寮€澶磡涓|璇佹槑|缁撳熬)[:锛歖\s*/, "")
    .trim();
}

function splitScriptSentences(text) {
  const raw = String(text || "").trim();
  if (!raw) return [];
  const labeledSpeech = raw
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => /^(?:鏂囨|鍙ｆ挱|鍙拌瘝)[:锛歖/.test(line))
    .map(stripSpokenLine)
    .filter(Boolean);
  if (labeledSpeech.length >= 3) return labeledSpeech;
  const lineParts = raw.split(/\n+/).map(stripSpokenLine).filter(Boolean);
  if (lineParts.length >= 3) return lineParts;
  return raw
    .replace(/([銆傦紒锛??])/g, "$1\n")
    .split(/\n+/)
    .map(stripSpokenLine)
    .filter((line) => line.length >= 6);
}

function inferMaterialLabel(text) {
  if (/鍙ｆ挱|鑰佹澘|鐪熶汉|璁茶В|姝ｅ闀滃ご/.test(text)) return "鍙ｆ挱瑙嗛";
  if (/闂ㄥ簵|鐜|闂ㄥご|鍓嶅彴|鍟嗗湀|鍚屽煄|鍩庡競|琛楀尯/.test(text)) return "闂ㄥ簵鐜";
  if (/杩囩▼|娴佺▼|鎿嶄綔|鎶ょ悊|鏈嶅姟|鍒朵綔/.test(text)) return "椤圭洰杩囩▼";
  if (/鍙嶉|妗堜緥|椤惧|璇勪环|鍓嶅悗|瑙佽瘉/.test(text)) return "椤惧鍙嶉";
  if (/浜у搧|鍥㈣喘|濂楅|浠锋牸|鏉冪泭|鑿滃崟/.test(text)) return "浜у搧/鍥㈣喘鍥?;
  return "鍙ｆ挱瑙嗛";
}

function buildTopicScript(title, index = 0) {
  const brief = collectBrief();
  const industry = brief.storeIndustry || "鏈湴鐢熸椿";
  const brand = brief.brandName || "鎴戜滑搴?;
  const city = brief.storeCity || "鏈湴";
  const name = brief.personaName || "鑰佹澘";
  const mainProduct = brief.mainProduct || "涓绘帹椤圭洰";
  const advantage = brief.serviceAdvantage || "鐪熷疄銆佷笓涓氥€佺渷蹇?;
  if (state.activeTemplateCategory === "鍚屽煄鐭棰?) {
    return [
      `闀滃ご涓€锛氬鏋滀綘涔熷湪${city}銆傞€夊簵鍒彧鐪嬩环鏍笺€俙,
      `闀滃ご浜岋細鎴戝彨${name}銆傚湪${brand}鍋?{industry}銆俙,
      `闀滃ご涓夛細浠婂ぉ璁?{title}銆傚厛甯綘灏戣俯鍧戙€俙,
      `闀滃ご鍥涳細鍏堢湅鐜銆傚啀鐪嬭繃绋嬨€傝繕瑕佺湅鍙嶉銆俙,
      `闀滃ご浜旓細鍒氬ソ鍦ㄩ檮杩戙€傚厛鏀惰棌鍐嶆參鎱㈢湅銆俙,
    ].join("\n");
  }
  if (state.activeTemplateCategory === "鍥㈠崟鐭棰?) {
    return [
      `闀滃ご涓€锛氳繖涓?{mainProduct}銆備笉鏄皝閮介€傚悎銆俙,
      `闀滃ご浜岋細鍏堝埆鎬ョ潃涓嬪崟銆傚厛鐪嬩綘閫備笉閫傚悎銆俙,
      `闀滃ご涓夛細閲嶇偣涓嶆槸渚垮疁銆傛槸娴佺▼瑕佽娓呮銆俙,
      `闀滃ご鍥涳細鍒板簵鍏堢‘璁ら渶姹傘€傚啀瀹夋帓瀵瑰簲鏈嶅姟銆俙,
      `闀滃ご浜旓細鎷呭績涔伴敊銆傚彲浠ュ厛绉佷俊闂垜銆俙,
    ].join("\n");
  }
  return [
    `闀滃ご涓€锛氳棰戞病鏁堟灉銆傚線寰€涓嶆槸涓嶄細鎷嶃€俙,
    `闀滃ご浜岋細浠婂ぉ璁?{title}銆傚厛鎶撲綇瀹㈡埛鎷呭績銆俙,
    `闀滃ご涓夛細鎴戝彨${name}銆傚湪${brand}鍋?{industry}銆俙,
    `闀滃ご鍥涳細浼樺娍鏄?{advantage}銆備絾鍒彧鍠婂彛鍙枫€俙,
    `闀滃ご浜旓細鍏堣瀹㈡埛鐪嬫噦銆傚啀璁╁鎴峰挩璇€俙,
  ].join("\n");
}

function buildTopicShotPrompts(title, index = 0) {
  const brief = collectBrief();
  const brand = brief.brandName || "闂ㄥ簵";
  const city = brief.storeCity || "鏈湴";
  const scriptLines = buildTopicScript(title, index).split(/\n+/).map(stripSpokenLine);
  const scenes = [
    `${brief.personaName || "鑰佹澘"}绔欏湪${brand}闂ㄥ彛鎴栧墠鍙帮紝鎵嬫満绔栧睆姝ｅ闀滃ご寮€鍦猴紝鑳屾櫙鑳界湅鍒伴棬搴楁爣璇哷,
    `鍒囧埌${city}琛楀尯銆佸晢鍦堟垨闂ㄥ簵澶栨櫙锛岀敾闈㈣妭濂忓揩涓€鐐癸紝鎵挎帴鍚屽煄鎰熷拰鐪熷疄鍦烘櫙`,
    `鎷嶆湇鍔℃祦绋嬨€侀」鐩搷浣滄垨浜у搧缁嗚妭鐗瑰啓锛屽姩浣滆娓呮锛岃瀹㈡埛鑳界湅鎳備綘鍦ㄥ仛浠€涔坄,
    `鍒囬【瀹㈠弽棣堛€侀棬搴楃幆澧冦€佸墠鍚庡姣旀垨妗堜緥鐓х墖锛岀敾闈㈠仠鐣?2-3 绉掔粰瑙備紬鐪嬫竻妤歚,
    `鍥炲埌鑰佹澘鍙ｆ挱锛岄暅澶撮潬杩戜竴鐐癸紝缁欏嚭鏀惰棌銆佺淇°€佸埌搴椾綋楠屾垨鍥㈣喘棰嗗彇鍔ㄤ綔`,
  ];
  return scenes.map((scene, idx) => {
    const material = inferMaterialLabel(scene);
    return `闀滃ご ${String(idx + 1).padStart(2, "0")}锛氭枃妗堬細${scriptLines[idx] || title}锛涚敾闈細${scene}锛涚礌鏉愶細${material}`;
  });
}

function normalizeExecutableScript(script, title, index = 0) {
  const lines = splitScriptSentences(script);
  if (lines.length < 3) return buildTopicScript(title, index);
  return lines.slice(0, 6).map((line, idx) => `闀滃ご${topicNumberLabels[idx] || idx + 1}锛?{line}`).join("\n");
}

function normalizeShotPrompts(prompts, title, index = 0) {
  const scriptLines = buildTopicScript(title, index).split(/\n+/).map(stripSpokenLine);
  return prompts.slice(0, 6).map((line, idx) => {
    const clean = String(line || "").trim();
    if (/鏂囨[:锛歖.+鐢婚潰[:锛歖/.test(clean)) return clean;
    return `闀滃ご ${String(idx + 1).padStart(2, "0")}锛氭枃妗堬細${scriptLines[idx] || title}锛涚敾闈細${clean}锛涚礌鏉愶細${inferMaterialLabel(clean)}`;
  });
}

function buildFallbackTopicOptions(result = {}) {
  const brief = collectBrief();
  const industry = brief.storeIndustry || "鏈湴鐢熸椿";
  const brand = brief.brandName || "闂ㄥ簵";
  const city = brief.storeCity || "鏈湴";
  const location = brief.storeLocation || city;
  const mainProduct = brief.mainProduct || "涓绘帹濂楅";
  let base = [];
  if (state.activeTemplateCategory === "鍚屽煄鐭棰?) {
    base = [
      { title: `${city}涓嬬彮鍚庯紝涓轰粈涔堣秺鏉ヨ秺澶氫汉鎯虫壘涓€瀹剁渷蹇冪殑搴梎, reason: "鐢ㄥ煄甯傜敓娲诲満鏅湀浣忛檮杩戜汉缇わ紝鍐嶈嚜鐒舵壙鎺ラ棬搴椾俊浠汇€? },
      { title: `浣忓湪${location}闄勮繎锛屾€庝箞鍒ゆ柇涓€瀹跺簵闈犱笉闈犺氨`, reason: "鍚屽煄鐢ㄦ埛鍏堝叧蹇冭窛绂诲拰椋庨櫓锛岄€傚悎鐢ㄩ伩鍧戝垏鍙ｇ牬鍦堛€? },
      { title: `${city}浜烘渶杩戞渶瀹规槗蹇界暐鐨勪竴娆″埌搴楁秷璐归€夋嫨`, reason: "浠庢湰鍦扮敓娲讳範鎯垏鍏ワ紝涓嶇洿鎺ョ‖璁茶涓氾紝鏇村鏄撳仠鐣欍€? },
    ];
  } else if (state.activeTemplateCategory === "鍥㈠崟鐭棰?) {
    base = [
      { title: `${mainProduct}鍒板簳閫傚悎璋侊紝涓嶉€傚悎璋乣, reason: "鍏堥檷浣庡喅绛栨垚鏈紝璁╃敤鎴峰垽鏂嚜宸辫涓嶈涔般€? },
      { title: `绗竴娆″埌${brand}浣跨敤鍥㈠崟锛屽厛鐪嬭繖鍑犱釜缁嗚妭`, reason: "鎶婃祦绋嬭娓呮锛屽噺灏戝埌搴楀墠鐨勪笉纭畾鎰熴€? },
      { title: `杩欎釜濂楅涓轰粈涔堜笉鏄崟绾究瀹滐紝鑰屾槸鐪佸績`, reason: "鎶婁环鏍奸敋鐐硅浆鎴愪环鍊奸敋鐐癸紝閫傚悎杞寲銆? },
    ];
  } else {
    base = [
      { title: `寰堝${industry}瑙嗛娌℃晥鏋滐紝涓嶆槸鍥犱负涓嶄細鎷峘, reason: "鐢ㄥ弽甯歌瘑鍒囧叆锛屽厛鎶撳仠鐣欙紝鍐嶈鐪熷疄鍒ゆ柇銆? },
      { title: `瀹㈡埛涓嶄俊浠讳綘锛屽線寰€涓嶆槸浠锋牸闂`, reason: "鍑讳腑鑰佹澘鍜屽鎴蜂箣闂寸殑淇′换鍗＄偣锛岄€傚悎鍒堕€犲叡楦ｃ€? },
      { title: `${industry}閲屾渶瀹规槗璁╁鎴疯俯鍧戠殑涓€浠朵簨`, reason: "閬垮潙澶╃劧甯︽儏缁拰鏀惰棌鍔ㄤ綔锛岄€傚悎娴侀噺鍏ュ彛銆? },
    ];
  }
  const modelTitle = cleanTopicTitle(result.title);
  if (modelTitle && !/鑴氭湰|Untitled/i.test(modelTitle) && !base.some((item) => item.title === modelTitle)) {
    base.unshift({ title: modelTitle, reason: "DeepSeek 鎺ㄨ崘鐨勪富閫夐锛屽凡鏀惧湪绗竴浣嶃€? });
  }
  return base.slice(0, 3);
}

function normalizeTopicOptions(result = {}) {
  const rawOptions = Array.isArray(result.topicOptions) ? result.topicOptions : [];
  const parsedOptions = rawOptions.map((option) => ({
    title: option?.title || option?.name || option?.topic || option?.heading,
    reason: option?.reason || option?.logic || option?.description || option?.summary || option?.strategy,
    script: option?.script || option?.copy || option?.content,
    shotPrompts: option?.shotPrompts || option?.shots || option?.storyboard,
    tags: option?.tags,
  }));
  const strategyOptions = parseTopicOptionsFromStrategy(result.strategy);
  const seedOptions = [...parsedOptions, ...strategyOptions].filter((option) => cleanTopicTitle(option.title));
  const baseOptions = seedOptions.length ? seedOptions : buildFallbackTopicOptions(result);
  const unique = [];
  baseOptions.forEach((option) => {
    const title = cleanTopicTitle(option.title);
    if (!title || unique.some((item) => item.title === title)) return;
    unique.push({ ...option, title });
  });
  return unique.slice(0, 5).map((option, index) => {
    const title = cleanTopicTitle(option.title) || buildFallbackTopicOptions(result)[index]?.title || `閫夐${topicNumberLabels[index] || index + 1}`;
    const directScript = option.script || (index === 0 ? result.script : "");
    const rawShotPrompts = normalizeStringList(option.shotPrompts).length
      ? normalizeStringList(option.shotPrompts)
      : (index === 0 ? normalizeStringList(result.shotPrompts) : []);
    return {
      title,
      reason: cleanTopicReason(option.reason),
      script: normalizeExecutableScript(directScript, title, index),
      shotPrompts: rawShotPrompts.length ? normalizeShotPrompts(rawShotPrompts, title, index) : buildTopicShotPrompts(title, index),
      tags: Array.isArray(option.tags) ? option.tags : (Array.isArray(result.tags) ? result.tags : []),
    };
  });
}

function renderTopicIdeas(options) {
  const box = $("scriptTopicIdeas");
  if (!box) return;
  box.value = options.map((option, index) => {
    const label = topicNumberLabels[index] || index + 1;
    return `閫夐${label}锛?{option.title}\n鐞嗙敱锛?{option.reason}`;
  }).join("\n\n");
}

function renderTopicChoiceBar() {
  const bar = $("topicChoiceBar");
  if (!bar) return;
  const options = state.scriptTopicOptions || [];
  bar.classList.toggle("hidden", !options.length);
  if (!options.length) {
    bar.innerHTML = "";
    return;
  }
  bar.innerHTML = `<span>閫夌敤</span>${options.map((_, index) => {
    const label = topicNumberLabels[index] || index + 1;
    return `<button type="button" class="topic-choice ${index === state.selectedTopicIndex ? "active" : ""}" data-topic-index="${index}">閫夐${label}</button>`;
  }).join("")}`;
  bar.querySelectorAll("[data-topic-index]").forEach((btn) => {
    btn.addEventListener("click", () => applySelectedTopic(Number(btn.dataset.topicIndex)));
  });
}

function applySelectedTopic(index = 0, options = {}) {
  const topic = state.scriptTopicOptions[index];
  if (!topic) return;
  const rows = getTopicShotRows(topic);
  state.selectedTopicIndex = index;
  $("resultTitle").value = topic.title;
  $("resultScript").value = formatScriptRows(rows);
  $("resultPrompts").value = formatPromptRows(rows);
  $("resultTags").value = Array.isArray(topic.tags) ? topic.tags.join("銆?) : "";
  $("ttsText").value = formatVoiceoverRows(rows);
  $("videoTitle").value = topic.title;
  $("videoScript").value = formatVoiceoverRows(rows);
  renderTopicChoiceBar();
  if (!options.silent) {
    toast(`宸查€夌敤閫夐${topicNumberLabels[index] || index + 1}`);
  }
  scheduleWorkspaceDraftSave();
}

function getTopicShotRows(topic = {}) {
  const promptRows = normalizeStringList(topic.shotPrompts).map(parseShotLine).filter((row) => row.text || row.visual);
  const scriptRows = String(topic.script || "")
    .split(/\n+/)
    .map((line) => cleanVoiceoverLine(line))
    .filter(Boolean);
  const fallbackPrompts = buildTopicShotPrompts(topic.title || "閫夐", state.selectedTopicIndex || 0).map(parseShotLine);
  const count = Math.max(promptRows.length, scriptRows.length, 4);
  const rows = Array.from({ length: Math.min(count, 8) }).map((_, index) => {
    const prompt = promptRows[index] || fallbackPrompts[index] || {};
    const promptText = cleanVoiceoverLine(prompt.text || "");
    const text = isInstructionalSpokenText(promptText)
      ? cleanVoiceoverLine(scriptRows[index] || topic.title || "")
      : cleanVoiceoverLine(promptText || scriptRows[index] || topic.title || "");
    const visual = cleanVisualLine(prompt.visual || inferVisual(text, assetTypeLabels[prompt.materialType] || "鍙ｆ挱鐢婚潰"));
    const materialType = prompt.materialType || inferMaterialType(`${text} ${visual}`) || assetOrder[index % assetOrder.length][0];
    const materialLabel = prompt.materialLabel || assetTypeLabels[materialType] || inferMaterialLabel(`${text} ${visual}`);
    return {
      text,
      visual,
      materialType,
      materialLabel,
    };
  }).filter((row) => row.text);
  return expandShotRowsForEditing(rows, 12);
}

function expandShotRowsForEditing(rows, limit = 12) {
  const expanded = [];
  normalizeList(rows).forEach((row) => {
    const segments = splitVoiceoverForShot(row.text);
    if (!segments.length) return;
    segments.forEach((segment, segmentIndex) => {
      expanded.push({
        ...row,
        text: segment,
        visual: segmentIndex === 0
          ? cleanVisualLine(row.visual || inferVisual(segment, row.materialLabel || "鍙ｆ挱鐢婚潰"))
          : continueVisualForSegment(row.visual, row.materialLabel, segmentIndex),
      });
    });
  });
  return expanded.slice(0, limit);
}

function splitVoiceoverForShot(text = "", target = 12, max = 16) {
  const clean = cleanVoiceoverLine(text)
    .replace(/[锛?銆侊紱;锛?]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) return [];
  const rawParts = clean
    .split(/(?<=[銆傦紒锛??])|\s+/)
    .map((part) => part.replace(/[銆傦紒锛??]/g, "").trim())
    .filter(Boolean);
  const sourceParts = rawParts.length ? rawParts : [clean];
  const segments = [];
  sourceParts.forEach((part) => {
    splitTextByLength(part, target, max).forEach((segment) => segments.push(segment));
  });
  if (segments.length > 1 && segments[segments.length - 1].length < 5) {
    const tail = segments.pop();
    segments[segments.length - 1] = `${segments[segments.length - 1]}${tail}`;
  }
  return segments;
}

function splitTextByLength(text = "", target = 12, max = 16) {
  const value = String(text || "").trim();
  if (!value) return [];
  if (value.length <= max) return [value];
  const result = [];
  let rest = value;
  while (rest.length > max) {
    let cut = findNaturalCut(rest, target, max);
    if (cut < 6) cut = Math.min(target, rest.length);
    result.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) result.push(rest);
  return result.filter(Boolean);
}

function findNaturalCut(text, target, max) {
  const preferred = ["浣嗘槸", "鎵€浠?, "鍥犱负", "濡傛灉", "鐒跺悗", "鍏?, "鍐?, "鎵?, "灏?, "璁?, "鐪?, "鍋?, "鐪?, "姣?];
  for (let i = Math.min(max, text.length - 1); i >= 6; i -= 1) {
    const left = text.slice(Math.max(0, i - 2), i + 2);
    if (preferred.some((word) => left.includes(word)) && Math.abs(i - target) <= 5) return i;
  }
  return Math.min(target, max, text.length);
}

function continueVisualForSegment(visual = "", materialLabel = "", index = 1) {
  const base = cleanVisualLine(visual || materialLabel || "鍚屼竴鍦烘櫙缁х画鎷?);
  if (/杩戞櫙|鐗瑰啓|缁嗚妭|鍔ㄤ綔|鍒?.test(base)) return base;
  return `${base}锛岃ˉ鎷嶈繎鏅垨鍔ㄤ綔缁嗚妭 ${index + 1}`;
}

function isInstructionalSpokenText(text = "") {
  const value = String(text || "");
  if (!value) return false;
  return /浣犺|闇€瑕亅搴旇|鍙互|璇存槑|璁茶В|琛ㄨ揪|寮鸿皟|灞曠ず|寮曞|鍛婅瘔瀹㈡埛|璇村嚭|绐佸嚭/.test(value) &&
    !/鎴憒鎴戜滑|浣犲鏋渱濡傛灉浣爘鍏堢湅|鍒€璁颁綇|鏀惰棌|绉佷俊|鍒板簵/.test(value);
}

function formatScriptRows(rows) {
  return rows.map((row, index) => `闀滃ご${index + 1}锛?{row.text}`).join("\n");
}

function formatVoiceoverRows(rows) {
  return rows.map((row) => row.text).join("\n");
}

function formatPromptRows(rows) {
  return rows.map((row, index) => (
    `闀滃ご ${String(index + 1).padStart(2, "0")}锝滃彛鎾細${row.text}锝滄媿鎽勶細${row.visual}锝滅礌鏉愶細${row.materialLabel}`
  )).join("\n");
}

function applyAiResult(data, taskType = "") {
  const r = data.result || {};
  if (taskType === "research" || r.taskType === "research") state.lastResearch = r;
  const activeMode = (taskType === "script" || r.taskType === "script") ? ($("scriptModelMode")?.value || "fast") : ($("modelMode")?.value || "fast");
  const modelLine = `${data.provider || r.provider || "local"} / ${r.mode || activeMode} / ${r.model || "local-template"}`;
  if (taskType === "research" || r.taskType === "research") {
    $("modelBadge").textContent = modelLine;
  }
  if (taskType === "research" || r.taskType === "research" || !$("resultStrategy").value.trim()) {
    $("resultStrategy").value = r.strategy || "";
  }
  if (taskType === "script" || r.taskType === "script" || r.script || r.shotPrompts) {
    state.scriptTopicOptions = normalizeTopicOptions(r);
    state.selectedTopicIndex = 0;
    renderTopicIdeas(state.scriptTopicOptions);
    if ($("scriptDossierState")) $("scriptDossierState").textContent = `宸茬敓鎴?路 ${modelLine}`;
    applySelectedTopic(0, { silent: true });
    scheduleWorkspaceDraftSave();
    return;
  }
  renderCockpit();
  scheduleWorkspaceDraftSave();
}

function renderTemplateTabs() {
  const categories = Object.keys(templateLibrary);
  $("templateTabs").innerHTML = categories.map((name) => (
    `<button type="button" class="template-tab ${name === state.activeTemplateCategory ? "active" : ""}" data-category="${escapeHtml(name)}">${escapeHtml(name)}</button>`
  )).join("");
  document.querySelectorAll(".template-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.activeTemplateCategory = btn.dataset.category;
      renderTemplateTabs();
      renderTemplateSelect();
      updateScriptSeriesFields();
      scheduleWorkspaceDraftSave();
    });
  });
}

function renderTemplateSelect() {
  const list = templateLibrary[state.activeTemplateCategory] || [];
  $("templateSelect").innerHTML = list.map((tpl) => `<option value="${tpl.id}">${escapeHtml(tpl.name)}</option>`).join("");
  renderTemplatePreview();
  updateScriptSeriesFields();
  renderCockpit();
}

function getSelectedTemplate() {
  const list = templateLibrary[state.activeTemplateCategory] || [];
  const id = $("templateSelect")?.value || list[0]?.id;
  return list.find((item) => item.id === id) || list[0] || null;
}

function renderTemplatePreview() {
  const tpl = getSelectedTemplate();
  if (!tpl) {
    $("templatePreview").textContent = "鏆傛棤妯℃澘";
    return;
  }
  const hints = {
    "娴侀噺鐭棰?: "鍏堝嚭鑳借浜哄仠鐣欑殑閫夐锛屽啀鐢熸垚鏂囨鍜屽垎闀溿€?,
    "鍚屽煄鐭棰?: "鍏堥€変汉缇ゅ拰骞撮緞锛屽啀鐢熸垚鍚屽煄鐮村湀閫夐銆?,
    "鍥㈠崟鐭棰?: "鍏堝嚭濂楅杞寲閫夐锛屽啀鐢熸垚鏂囨鍜屽垎闀溿€?
  };
  $("templatePreview").innerHTML = `<strong>褰撳墠绯诲垪锛?{escapeHtml(tpl.name)}</strong><span>${escapeHtml(hints[tpl.name] || "绯荤粺浼氱粨鍚堟。妗堢敓鎴愰€夐銆佹枃妗堝拰鍒嗛暅銆?)}</span>`;
}

function applyTemplateToScript(overwrite = true) {
  const tpl = getSelectedTemplate();
  if (!tpl) return;
  if (overwrite || !$("resultScript").value.trim()) {
    $("resultScript").value = "";
    $("ttsText").value = "";
    $("videoScript").value = "";
  }
  if (!$("resultTitle").value.trim()) {
    $("resultTitle").value = `${state.activeTemplateCategory}鑴氭湰`;
    $("videoTitle").value = $("resultTitle").value;
  }
}

function ensureShots() {
  if (!state.shots.length) {
    const builtShots = buildShotsFromInputs();
    state.shots = builtShots.length ? builtShots : getDefaultShots();
  }
  state.shots = state.shots.map(normalizeShot);
}

function normalizeShot(shot, index = 0) {
  const cleanText = cleanVoiceoverLine(shot.text || "");
  const materialType = shot.materialType || inferMaterialType(`${cleanText} ${shot.visual || ""}`) || assetOrder[index % assetOrder.length][0];
  const normalized = {
    ...shot,
    text: cleanText,
    materialType,
    voiceId: shot.voiceId || "",
  };
  normalized.libraryId = resolveShotLibraryId(shot.libraryId, normalized);
  return normalized;
}

function getDefaultShots() {
  return [
    { text: "鐥涚偣寮€鍦猴細璇村嚭鐩爣瀹㈡埛姝ｅ湪缁忓巻鐨勯棶棰?, visual: "鑰佹澘鍙ｆ挱鎴栭棬搴楃幆澧?, materialType: "talking_head" },
    { text: "瑙ｉ噴鍘熷洜锛氫负浠€涔堜細鍑虹幇杩欎釜闂", visual: "椤圭洰杩囩▼鎴栫煡璇嗗崱鐗?, materialType: "process" },
    { text: "灞曠ず璇佹槑锛氭祦绋嬨€佺幆澧冦€佸弽棣堟垨妗堜緥", visual: "闂ㄥ簵鐜 + 椤惧鍙嶉", materialType: "feedback" },
    { text: "琛屽姩寮曞锛氱淇″挩璇€侀绾︿綋楠屾垨棰嗗彇鍥㈣喘", visual: "浜у搧鍥?鍥㈣喘鍥?+ 鑰佹澘鍙ｆ挱", materialType: "product" },
  ].map(normalizeShot);
}

function cleanVoiceoverLine(value = "") {
  return String(value || "")
    .replace(/^\s*[-*鈼廬\s*/, "")
    .replace(/^\s*(?:闀滃ご|鍒嗛暅|娈佃惤|绗??\s*[0-9涓€浜屼笁鍥涗簲鍏竷鍏節鍗乚+\s*(?:闀渱娈??\s*[:锛氥€?锛?]\s*/i, "")
    .replace(/^\s*(?:鏂囨鍐呭|鍙ｆ挱鏂囨|鏂囨|鍙ｆ挱|鍙拌瘝|璇磋瘽鍐呭)\s*[:锛歖\s*/i, "")
    .replace(/[锝渱]\s*(?:鎷嶆憚|鐢婚潰|鍒嗛暅|鍦烘櫙|鍔ㄤ綔)\s*[:锛歖.*$/i, "")
    .replace(/[锛?]\s*(?:鎷嶆憚|鐢婚潰|鍒嗛暅|鍦烘櫙|鍔ㄤ綔)\s*[:锛歖.*$/i, "")
    .replace(/[锝渱锛?]\s*(?:绱犳潗|绱犳潗鍒嗙被|瑙嗛搴?\s*[:锛歖.*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanVisualLine(value = "") {
  return String(value || "")
    .replace(/^\s*(?:鐢婚潰|鎷嶆憚|鍒嗛暅鐢婚潰|鍒嗛暅|鍦烘櫙|鍔ㄤ綔)\s*[:锛歖\s*/i, "")
    .replace(/[锝渱锛?]\s*(?:绱犳潗|绱犳潗鍒嗙被|瑙嗛搴?\s*[:锛歖.*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function buildRenderShots() {
  ensureShots();
  return normalizeList(state.shots)
    .map((shot, index) => {
      const text = cleanVoiceoverLine(shot.text);
      const visual = String(shot.visual || "").trim();
      return normalizeShot({
        ...shot,
        text,
        visual,
        duration: estimateShotDuration(text, index),
      }, index);
    })
    .filter((shot) => shot.text);
}

function estimateShotDuration(text, index = 0) {
  const length = cleanVoiceoverLine(text).length;
  if (!length) return 3;
  const estimated = Math.ceil(length / 5) * 0.95 + 1;
  const adjusted = index === 0 ? estimated + 0.4 : estimated;
  return Math.max(2.4, Math.min(8.5, Number(adjusted.toFixed(1))));
}

function buildVoiceoverText(shots, fallbackScript = "") {
  const lines = normalizeList(shots)
    .map((shot) => cleanVoiceoverLine(shot.text))
    .filter(Boolean);
  if (lines.length) return lines.join("\n");
  return String(fallbackScript || "")
    .split(/\n+/)
    .map(cleanVoiceoverLine)
    .filter(Boolean)
    .join("\n");
}

function buildShotsFromInputs() {
  const promptLines = $("resultPrompts").value
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const scriptLines = $("resultScript").value
    .split(/\n+/)
    .map((line) => cleanVoiceoverLine(line.trim()))
    .filter(Boolean);
  const rows = promptLines.length
    ? promptLines.map(parseShotLine)
    : scriptLines.map((text, index) => ({ text, visual: inferVisual(text, assetOrder[index % assetOrder.length][1]) }));
  return expandShotRowsForEditing(rows, 12).map((parsed, index) => {
    const [materialType, label] = assetOrder[index % assetOrder.length];
    const visual = cleanVisualLine(parsed.visual || inferVisual(parsed.text, label));
    const finalMaterialType = parsed.materialType || inferMaterialType(`${parsed.text} ${visual} ${parsed.materialLabel || ""}`) || materialType;
    return {
      text: cleanVoiceoverLine(parsed.text),
      visual,
      materialType: finalMaterialType,
      libraryId: inferAssetLibraryIdForShot({
        text: parsed.text,
        visual,
        materialType: finalMaterialType,
      }),
    };
  }).filter((shot) => shot.text);
}

function parseShotLine(line) {
  const raw = String(line || "").replace(/^[-*鈼廫s]*/, "").trim();
  const textMatch = raw.match(/(?:鍙ｆ挱鏂囨|鏂囨鍐呭|鏂囨|鍙ｆ挱|鍙拌瘝)[:锛歖\s*([^|锝滐紱;]+)/);
  const visualMatch = raw.match(/(?:鍒嗛暅鐢婚潰|鎷嶆憚鎸囧|鎷嶆憚|鐢婚潰|鍒嗛暅|鍦烘櫙|鍔ㄤ綔)[:锛歖\s*([^|锝滐紱;]+)/);
  const materialMatch = raw.match(/(?:绱犳潗鍒嗙被|闇€瑕佺礌鏉恷绱犳潗|瑙嗛搴?[:锛歖\s*([^|锝滐紱;]+)/);
  const text = cleanVoiceoverLine(textMatch ? textMatch[1] : raw);
  const visual = cleanVisualLine(visualMatch ? visualMatch[1] : "");
  const materialLabel = (materialMatch ? materialMatch[1] : "").trim() || inferMaterialLabel(`${text} ${visual}`);
  const materialSource = `${visual} ${materialLabel} ${raw}`;
  const materialType = inferMaterialType(materialSource);
  return { text, visual, materialType, materialLabel };
}

function splitScriptToShots() {
  if (!$("resultScript").value.trim() && !$("resultPrompts").value.trim()) {
    toast("璇峰厛鐢?DeepSeek 鐢熸垚鏂囨鍜屽垎闀滐紝鍐嶅鍏ュ壀杈戦暅澶?);
    return false;
  }
  const builtShots = buildShotsFromInputs();
  state.shots = builtShots.length ? builtShots : getDefaultShots();
  renderShotTable();
  renderMixPlan();
  renderCockpit();
  scheduleWorkspaceDraftSave();
  return true;
}

function inferVisual(line, fallbackLabel) {
  if (/鍙ｆ挱|鑰佹澘|璁瞸瑙ｉ噴/.test(line)) return "鑰佹澘鍙ｆ挱 / 鏁板瓧浜哄彛鎾?;
  if (/闂ㄥ簵|鐜|鍒板簵|绌洪棿/.test(line)) return "闂ㄥ簵鐜闀滃ご";
  if (/杩囩▼|娴佺▼|鎿嶄綔|椤圭洰/.test(line)) return "椤圭洰杩囩▼鐗瑰啓";
  if (/鍙嶉|妗堜緥|椤惧|鍓嶅悗/.test(line)) return "椤惧鍙嶉鎴栨渚嬭瘉鏄?;
  if (/鍥㈣喘|浜у搧|濂楅|浠锋牸/.test(line)) return "浜у搧/鍥㈣喘鏉冪泭鐢婚潰";
  return fallbackLabel;
}

function inferMaterialType(text) {
  if (/鍙ｆ挱|鑰佹澘|鐪熶汉|璁茶В|瑙ｉ噴/.test(text)) return "talking_head";
  if (/闂ㄥ簵|鐜|闂ㄥご|鍓嶅彴|鍟嗗湀|鍚屽煄|鍒板簵|绌洪棿/.test(text)) return "scene";
  if (/杩囩▼|娴佺▼|鎿嶄綔|鎶ょ悊|鏈嶅姟|椤圭洰/.test(text)) return "process";
  if (/鍙嶉|妗堜緥|椤惧|璇勪环|鍓嶅悗/.test(text)) return "feedback";
  if (/鍥㈣喘|浜у搧|濂楅|浠锋牸|鍒?.test(text)) return "product";
  return "";
}

function getEditableAssetGroups() {
  return normalizeList(state.assetGroups).length ? normalizeList(state.assetGroups) : [...defaultAssetGroups];
}

function resolveShotLibraryId(preferredId, shot = {}) {
  const groups = getEditableAssetGroups();
  if (preferredId && groups.some((group) => group.id === preferredId)) return preferredId;
  const inferred = inferAssetLibraryIdForShot(shot);
  if (inferred && groups.some((group) => group.id === inferred)) return inferred;
  return groups[0]?.id || "ungrouped";
}

function inferAssetLibraryIdForShot(shot = {}) {
  const groups = getEditableAssetGroups();
  if (!groups.length) return "ungrouped";
  const source = `${shot.text || ""} ${shot.visual || ""} ${assetTypeLabels[shot.materialType] || ""}`.toLowerCase();
  const assetsByLibrary = groupAssetsByLibrary(state.assets);
  let best = { id: "ungrouped", score: -1 };
  groups.forEach((group) => {
    const name = String(group.name || "").toLowerCase();
    const assets = assetsByLibrary[group.id] || [];
    let score = 0;
    if (name && source.includes(name)) score += 30;
    name.split(/[\s/_\-銆侊紝,]+/).filter(Boolean).forEach((part) => {
      if (part.length >= 2 && source.includes(part)) score += 8;
    });
    const sameTypeAssets = assets.filter((asset) => asset.type === shot.materialType);
    if (sameTypeAssets.length) score += 6;
    assets.slice(0, 10).forEach((asset) => {
      const assetName = String(asset.name || "").toLowerCase();
      if (assetName && source.includes(assetName)) score += 4;
    });
    if (score > best.score) best = { id: group.id, score };
  });
  return best.id || groups[0]?.id || "ungrouped";
}

function addShot() {
  state.shots.push({
    text: "鏂伴暅澶达細琛ュ厖杩欓噷瑕佽鐨勫唴瀹?,
    visual: "閫夋嫨閫傚悎鐨勭敾闈?,
    materialType: "talking_head",
    libraryId: "ungrouped",
    voiceId: "",
  });
  renderShotTable();
  renderMixPlan();
  renderCockpit();
  scheduleWorkspaceDraftSave();
}

function removeShot(index) {
  if (!state.shots[index]) return;
  if (state.shots.length <= 1) {
    toast("鑷冲皯淇濈暀涓€涓暅澶?);
    return;
  }
  state.shots.splice(index, 1);
  renderShotTable();
  renderMixPlan();
  renderCockpit();
  scheduleWorkspaceDraftSave();
}

function autoMatchShots() {
  state.shots = state.shots.map((shot, index) => {
    const text = `${shot.text} ${shot.visual}`;
    const materialType = inferMaterialType(text) || assetOrder[index % assetOrder.length][0];
    return normalizeShot({ ...shot, materialType, libraryId: inferAssetLibraryIdForShot({ ...shot, materialType }) }, index);
  });
  renderShotTable();
  renderMixPlan();
  renderCockpit();
  toast("宸叉寜闀滃ご鍐呭閲嶆柊鍖归厤瑙嗛搴?);
}

function clearShotTableView() {
  const body = $("shotTableBody");
  if (body) {
    body.innerHTML = `<tr><td colspan="4" class="meta">杩樻病鏈夊鍏ラ暅澶淬€傝鍏堝湪鑴氭湰椤电敓鎴愭枃妗堝拰鍒嗛暅锛屽啀鐐瑰嚮鈥滃鍏ュ壀杈戦暅澶粹€濄€?/td></tr>`;
  }
  if ($("shotCountLabel")) $("shotCountLabel").textContent = "0 涓?;
  const mixPlan = $("mixPlan");
  if (mixPlan) mixPlan.innerHTML = "";
  renderTitleRecommendation();
}

function renderShotTable() {
  const body = $("shotTableBody");
  if (!body) return;
  ensureShots();
  if ($("shotCountLabel")) $("shotCountLabel").textContent = `${state.shots.length} 涓猔;
  body.innerHTML = state.shots.map((shot, index) => `
    <tr>
      <td>
        <span class="shot-index">闀滃ご ${index + 1}</span>
        <button class="shot-delete-btn" type="button" data-shot-action="delete" data-shot="${index}">鍒犻櫎</button>
      </td>
      <td><textarea data-shot="${index}" data-field="text">${escapeHtml(shot.text)}</textarea></td>
      <td><textarea data-shot="${index}" data-field="visual">${escapeHtml(shot.visual)}</textarea></td>
      <td>
        <select class="shot-material-select" data-shot="${index}" data-field="libraryId">
          ${buildShotLibraryOptions(shot.libraryId || "ungrouped")}
        </select>
        <div class="meta shot-material-note">${escapeHtml(getAssetMatchLabel(shot.libraryId, shot.materialType))}</div>
      </td>
    </tr>
  `).join("");
  body.querySelectorAll("[data-field][data-shot]").forEach((el) => {
    el.addEventListener("input", updateShotFromInput);
    el.addEventListener("change", updateShotFromInput);
  });
  body.querySelectorAll("[data-shot-action='delete']").forEach((btn) => {
    btn.addEventListener("click", () => removeShot(Number(btn.dataset.shot)));
  });
  renderTitleRecommendation();
}

function updateShotFromInput(event) {
  const index = Number(event.target.dataset.shot);
  const field = event.target.dataset.field;
  if (!state.shots[index] || !field) return;
  state.shots[index][field] = event.target.value;
  if (field === "text" || field === "visual") {
    state.shots[index].materialType = inferMaterialType(`${state.shots[index].text} ${state.shots[index].visual}`) || state.shots[index].materialType;
  }
  renderMixPlan();
  renderCockpit();
  renderTitleRecommendation();
  scheduleWorkspaceDraftSave();
}

function buildShotLibraryOptions(selected = "ungrouped") {
  const groups = getEditableAssetGroups();
  return groups.map((group) => {
    const count = getAssetsByGroup(group.id).length;
    return `<option value="${escapeHtml(group.id)}" ${selected === group.id ? "selected" : ""}>${escapeHtml(group.name)}锛?{count}锛?/option>`;
  }).join("");
}

function getAssetMatchLabel(libraryId, materialType) {
  const assets = getAssetsByGroup(libraryId);
  const libraryName = getAssetGroupName(libraryId);
  if (!assets.length) return `銆?{libraryName}銆嶆殏鏃犵礌鏉愶紝鐢熸垚鏃朵細浣跨敤鍗犱綅娣峰壀`;
  const preferred = assets.filter((asset) => asset.type === materialType);
  if (preferred.length) {
    return `浠庛€?{libraryName}銆嶅尮閰?${preferred.length} 涓?{assetTypeLabels[materialType] || "绱犳潗"}锛?{preferred.slice(0, 2).map((a) => a.name).join("銆?)}`;
  }
  return `銆?{libraryName}銆嶆湁 ${assets.length} 涓礌鏉愶紝鐢熸垚鏃朵細鏅鸿兘杞崲`;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function uploadAssetThroughOss(file, libraryId, button) {
  const sign = await api("/api/oss/upload-url", {
    method: "POST",
    body: JSON.stringify({
      name: file.name,
      contentType: file.type || "application/octet-stream",
      size: file.size,
      type: $("assetType").value || "video",
      libraryId,
    }),
  });
  if (!sign.uploadUrl || !sign.objectKey) {
    throw new Error("OSS 涓婁紶绛惧悕鐢熸垚澶辫触");
  }
  if (button) button.textContent = "涓婁紶鍒?OSS...";
  const uploadHeaders = {
    "Content-Type": file.type || "application/octet-stream",
    ...(sign.headers || {}),
  };
  const uploadRes = await fetch(sign.uploadUrl, {
    method: sign.method || "PUT",
    headers: uploadHeaders,
    body: file,
  });
  if (!uploadRes.ok) {
    throw new Error(`OSS 涓婁紶澶辫触锛?{uploadRes.status}`);
  }
  const assetData = await api("/api/assets", {
    method: "POST",
    body: JSON.stringify({
      name: file.name,
      type: $("assetType").value || "video",
      libraryId,
      size: file.size,
      objectKey: sign.objectKey,
      url: sign.downloadUrl || sign.publicUrl || "",
    }),
  });
  return assetData.asset;
}

async function loadAssetGroups() {
  try {
    const data = await api("/api/asset-groups");
    state.assetGroups = normalizeList(data.groups);
    if (!state.assetGroups.length) state.assetGroups = [...defaultAssetGroups];
    if (state.activeAssetGroupId !== "all" && !state.assetGroups.some((group) => group.id === state.activeAssetGroupId)) {
      state.activeAssetGroupId = "all";
      localStorage.setItem("aivf_active_asset_group", state.activeAssetGroupId);
    }
  } catch (err) {
    if (!state.assetGroups.length) state.assetGroups = [...defaultAssetGroups];
    throw err;
  } finally {
    renderAssetLibrary();
    if (state.shots.length) {
      renderShotTable();
      renderMixPlan();
    }
  }
}

function getAssetLibraryId(asset) {
  const id = asset?.libraryId || asset?.groupId || "ungrouped";
  return state.assetGroups.some((group) => group.id === id) ? id : "ungrouped";
}

function getAssetGroupName(groupId) {
  if (groupId === "all") return "鍏ㄩ儴绱犳潗";
  const group = state.assetGroups.find((item) => item.id === groupId);
  return group?.name || "鏈垎缁?;
}

function getUsedAssetBytes() {
  return normalizeList(state.assets).reduce((sum, asset) => sum + (Number(asset.size) || 0), 0);
}

function getAssetsByGroup(groupId) {
  const assets = normalizeList(state.assets);
  if (groupId === "all") return assets;
  return assets.filter((asset) => getAssetLibraryId(asset) === groupId);
}

function setActiveAssetGroup(groupId) {
  const exists = groupId === "all" || state.assetGroups.some((group) => group.id === groupId);
  state.activeAssetGroupId = exists ? groupId : "all";
  localStorage.setItem("aivf_active_asset_group", state.activeAssetGroupId);
  renderAssetLibrary();
}

function openAssetGroupModal(groupId) {
  setActiveAssetGroup(groupId);
  state.assetModalOpen = true;
  renderAssetModal();
}

function closeAssetGroupModal() {
  state.assetModalOpen = false;
  renderAssetModal();
}

function isAssetSelected(assetId) {
  return normalizeList(state.selectedLibraryAssetIds).includes(assetId);
}

function toggleLibraryAssetSelection(assetId) {
  const selected = new Set(normalizeList(state.selectedLibraryAssetIds));
  if (selected.has(assetId)) {
    selected.delete(assetId);
  } else {
    selected.add(assetId);
  }
  state.selectedLibraryAssetIds = Array.from(selected);
  localStorage.setItem("aivf_selected_library_assets", JSON.stringify(state.selectedLibraryAssetIds));
  renderAssetModal();
}

async function deleteAsset(assetId) {
  const asset = normalizeList(state.assets).find((item) => item.id === assetId);
  if (!asset) {
    toast("杩欎釜绱犳潗涓嶅瓨鍦ㄦ垨宸茶鍒犻櫎");
    return;
  }
  if (!window.confirm(`纭畾鍒犻櫎绱犳潗锛?{asset.name || "鏈懡鍚嶇礌鏉?}锛焋)) return;
  await api("/api/assets/delete", {
    method: "POST",
    body: JSON.stringify({ assetId }),
  });
  state.selectedLibraryAssetIds = normalizeList(state.selectedLibraryAssetIds).filter((id) => id !== assetId);
  localStorage.setItem("aivf_selected_library_assets", JSON.stringify(state.selectedLibraryAssetIds));
  toast("绱犳潗宸插垹闄?);
  await loadAssets();
  renderShotTable();
  renderMixPlan();
}

async function createAssetGroup() {
  const name = window.prompt("杈撳叆鏂拌棰戝簱鍚嶇О锛屼緥濡傦細鏆戞湡娲诲姩銆佽€佸瑙佽瘉銆佺垎娆惧椁?);
  const clean = (name || "").trim();
  if (!clean) return;
  if (state.assetGroups.some((group) => group.name === clean)) {
    toast("杩欎釜瑙嗛搴撳凡缁忓瓨鍦?);
    return;
  }
  const data = await api("/api/asset-groups", {
    method: "POST",
    body: JSON.stringify({ name: clean }),
  });
  state.assetGroups = normalizeList(data.groups);
  setActiveAssetGroup(data.group?.id || "all");
  toast(`宸插垱寤鸿棰戝簱锛?{clean}`);
}

function renderAssetQuota() {
  const used = getUsedAssetBytes();
  const ratio = Math.min(100, Math.round((used / assetQuotaBytes) * 100));
  if ($("assetQuotaText")) $("assetQuotaText").textContent = `${formatSize(used)} / ${formatSize(assetQuotaBytes)}`;
  if ($("assetQuotaBar")) $("assetQuotaBar").style.width = `${ratio}%`;
  if ($("assetQuotaHint")) {
    $("assetQuotaHint").textContent = ratio >= 90
      ? "瀹归噺蹇弧浜嗭紝寤鸿娓呯悊鏃犵敤绱犳潗鎴栧噯澶囨墿瀹广€?
      : "鍐呴儴浣撻獙鐗堝厛闄愬埗 5GB锛屽悗缁澶栫増鍙寜璐﹀彿鎵╁銆?;
  }
}

function renderAssetGroupSelect() {
  const select = $("assetLibrarySelect");
  if (!select) return;
  const activeExists = state.assetGroups.some((group) => group.id === state.activeAssetGroupId);
  const preferred = activeExists ? state.activeAssetGroupId : "ungrouped";
  select.innerHTML = state.assetGroups.map((group) => (
    `<option value="${escapeHtml(group.id)}" ${preferred === group.id ? "selected" : ""}>${escapeHtml(group.name)}</option>`
  )).join("");
}

function renderAssetLibrary() {
  renderAssetQuota();
  renderAssetGroupSelect();
  const grid = $("assetGroupGrid");
  if (grid) {
    const cards = [
      { id: "all", name: "鍏ㄩ儴绱犳潗", locked: true },
      ...state.assetGroups,
    ].map((group) => {
      const assets = getAssetsByGroup(group.id);
      const size = assets.reduce((sum, asset) => sum + (Number(asset.size) || 0), 0);
      const active = state.activeAssetGroupId === group.id ? "active" : "";
      const thumbs = assets.slice(0, 3).map(() => `<span class="library-thumb"></span>`).join("");
      return `<button class="asset-group-card ${active}" data-asset-group-id="${escapeHtml(group.id)}" type="button">
        <div class="asset-group-name">${escapeHtml(group.name)}</div>
        <div class="asset-group-preview">${thumbs || `<span class="empty-film">鈻?/span>`}</div>
        <div class="asset-group-meta">
          <strong>${assets.length}</strong><span>涓礌鏉?/span><em>${formatSize(size)}</em>
        </div>
        <span class="asset-group-action">鐐瑰嚮绠＄悊 / 娣诲姞</span>
      </button>`;
    });
    grid.innerHTML = cards.join("");
  }
  renderAssetModal();
}

function renderAssetModal() {
  const modal = $("assetGroupModal");
  if (!modal) return;
  modal.classList.toggle("hidden", !state.assetModalOpen);
  modal.setAttribute("aria-hidden", String(!state.assetModalOpen));
  if (!state.assetModalOpen) return;
  renderAssetGroupSelect();
  const currentAssets = getAssetsByGroup(state.activeAssetGroupId);
  const currentSize = currentAssets.reduce((sum, asset) => sum + (Number(asset.size) || 0), 0);
  if ($("assetModalTitle")) $("assetModalTitle").textContent = getAssetGroupName(state.activeAssetGroupId);
  if ($("assetModalMeta")) $("assetModalMeta").textContent = `${currentAssets.length} 涓礌鏉?路 ${formatSize(currentSize)}`;
  if ($("assetUploadHint")) {
    $("assetUploadHint").textContent = state.activeAssetGroupId === "all"
      ? "褰撳墠鏌ョ湅鍏ㄩ儴绱犳潗锛涗笂浼犳椂璇烽€夋嫨鍏蜂綋瑙嗛搴撱€?
      : `绱犳潗浼氱洿鎺ヨ繘鍏ャ€?{getAssetGroupName(state.activeAssetGroupId)}銆嶃€俙;
  }
  const list = $("assetList");
  if (list) {
    list.innerHTML = currentAssets.map(assetCard).join("") || `<div class="library-empty">杩欎釜瑙嗛搴撹繕娌℃湁绱犳潗銆傜洿鎺ュ湪涓婇潰閫夋嫨鏂囦欢涓婁紶銆?/div>`;
  }
}

async function uploadAsset() {
  if (staticPreviewMode) {
    toast(staticPreviewMessage);
    return;
  }
  const file = $("assetFile").files[0];
  if (!file) {
    toast("鍏堥€夋嫨鏂囦欢");
    return;
  }
  if (getUsedAssetBytes() + file.size > assetQuotaBytes) {
    toast(`绱犳潗搴撳閲忎笉瓒筹細褰撳墠闄愬埗 ${formatSize(assetQuotaBytes)}`);
    return;
  }
  const libraryId = $("assetLibrarySelect")?.value || "ungrouped";
  const button = $("uploadAssetBtn");
  const oldText = button?.textContent || "";
  if (file.size >= 50 * 1024 * 1024) {
    toast(`姝ｅ湪涓婁紶 ${formatSize(file.size)}锛岃涓嶈鍏抽棴椤甸潰`);
  }
  if (button) {
    button.disabled = true;
    button.textContent = `涓婁紶涓?${formatSize(file.size)}`;
  }
  try {
    if (configuredApiBaseUrl) {
      await uploadAssetThroughOss(file, libraryId, button);
      $("assetFile").value = "";
      state.activeAssetGroupId = libraryId;
      localStorage.setItem("aivf_active_asset_group", state.activeAssetGroupId);
      toast("绱犳潗宸蹭笂浼犲埌 OSS");
      await loadAssets();
      return;
    }
    const headers = {
      "X-Asset-Name": encodeURIComponent(file.name),
      "X-Asset-Type": encodeURIComponent($("assetType").value || "video"),
      "X-Library-Id": encodeURIComponent(libraryId),
    };
    if (state.token) headers.Authorization = `Bearer ${state.token}`;
    const res = await fetch("/api/assets/upload", {
      method: "POST",
      headers,
      body: file,
    });
    const data = await res.json();
    if (!res.ok || data.ok === false) {
      throw new Error(data.error || `涓婁紶澶辫触锛?{res.status}`);
    }
    $("assetFile").value = "";
    state.activeAssetGroupId = libraryId;
    localStorage.setItem("aivf_active_asset_group", state.activeAssetGroupId);
    toast("绱犳潗宸蹭笂浼犲埌绱犳潗搴?);
    await loadAssets();
    if (state.shots.length) {
      renderShotTable();
      renderMixPlan();
    }
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = oldText || "涓婁紶鍒板綋鍓嶈棰戝簱";
    }
  }
}

async function loadAssets() {
  const data = await api("/api/assets");
  state.assets = normalizeList(data.assets);
  if ($("assetCount")) $("assetCount").textContent = state.assets.length;
  renderAssetLibrary();
  renderAssetOptions();
  if (state.shots.length) {
    renderEditorMaterialNotice();
    renderCockpit();
  }
}

function assetCard(a) {
  const label = assetTypeLabels[a.type] || a.type || "-";
  const groupName = getAssetGroupName(getAssetLibraryId(a));
  const selected = isAssetSelected(a.id);
  return `<div class="library-asset-row ${selected ? "selected" : ""}">
    <div>
      <div class="card-title">${escapeHtml(a.name || "鏈懡鍚嶇礌鏉?)}</div>
      <div class="meta">瑙嗛搴擄細${escapeHtml(groupName)} 路 鐢ㄩ€旓細${escapeHtml(label)}</div>
      <div class="meta">澶у皬锛?{formatSize(a.size)} 路 鏃堕棿锛?{escapeHtml(a.createdAt || "-")}</div>
    </div>
    <div class="asset-row-actions">
      <button class="secondary tiny-btn" type="button" data-select-asset-id="${escapeHtml(a.id)}">${selected ? "宸查€夋嫨" : "閫夋嫨"}</button>
      <a class="secondary tiny-btn" href="${a.url}" target="_blank">鎵撳紑</a>
      <button class="danger tiny-btn" type="button" data-delete-asset-id="${escapeHtml(a.id)}">鍒犻櫎</button>
    </div>
  </div>`;
  scheduleWorkspaceDraftSave();
}

function renderAssetOptions() {
  const sampleTypes = ["voice_sample", "talking_head", "audio", "video", "bgm"];
  const audioAssets = normalizeList(state.assets).filter((a) => sampleTypes.includes(a.type));
  if ($("voiceSampleSelect")) {
    $("voiceSampleSelect").innerHTML = audioAssets.map((a) => `<option value="${a.id}">${escapeHtml(a.name)}</option>`).join("") || `<option value="">鍏堜笂浼犲０闊虫牱鏈垨鍙ｆ挱瑙嗛</option>`;
  }
}

async function createVoice() {
  const name = $("voiceName").value.trim();
  if (!name) {
    toast("濉啓澹伴煶鍚嶇О");
    return;
  }
  const consent = $("voiceConsent").checked;
  const sampleAssetId = $("voiceSampleSelect").value;
  if (!sampleAssetId) {
    toast("鍏堥€夋嫨澹伴煶鏍锋湰");
    return;
  }
  const btn = $("createVoiceBtn");
  const oldText = btn.textContent;
  btn.disabled = true;
  btn.textContent = "澹伴煶鍏嬮殕涓?..";
  try {
    const data = await api("/api/voices/clone", {
      method: "POST",
      body: JSON.stringify({ name, consent, sampleAssetId }),
    });
    if (data.voice?.status !== "ready") {
      throw new Error("澹伴煶鍏嬮殕澶辫触锛氳閲嶆柊涓婁紶娓呮櫚澹伴煶鏍锋湰");
    }
    $("voiceName").value = "";
    $("voiceConsent").checked = false;
    toast(`澹伴煶鍏嬮殕宸插畬鎴愶細${data.voice.name}`);
    await loadVoices();
  } finally {
    btn.disabled = false;
    btn.textContent = oldText;
  }
}

async function deleteVoice(voiceId) {
  const voice = normalizeList(state.voices).find((item) => item.id === voiceId);
  if (!voice) {
    toast("杩欎釜澹伴煶涓嶅瓨鍦ㄦ垨宸茶鍒犻櫎");
    return;
  }
  if (!window.confirm(`纭畾鍒犻櫎澹伴煶锛?{voice.name || "鏈懡鍚嶅０闊?}锛焋)) return;
  await api("/api/voices/delete", {
    method: "POST",
    body: JSON.stringify({ voiceId }),
  });
  toast("澹伴煶宸插垹闄?);
  await loadVoices();
}

async function loadVoices() {
  const data = await api("/api/voices");
  state.voices = normalizeList(data.voices);
  if ($("voiceCount")) $("voiceCount").textContent = state.voices.length;
  renderVoiceOptions();
  renderShotTable();
  renderEditorMaterialNotice();
}

function buildGlobalVoiceOptions(selected = "") {
  const voices = normalizeList(state.voices);
  const localSelected = selected ? "" : "selected";
  const options = [`<option value="" ${localSelected}>榛樿鏈湴澹伴煶</option>`];
  voices.forEach((v, index) => {
    options.push(`<option value="${escapeHtml(v.id)}" ${selected === v.id ? "selected" : ""}>${escapeHtml(getVoiceDisplayName(v, index))}</option>`);
  });
  return options.join("");
}

function buildShotVoiceOptions(selected = "") {
  const voices = normalizeList(state.voices);
  const defaultSelected = selected ? "" : "selected";
  const options = [`<option value="" ${defaultSelected}>璺熼殢鍏ㄧ墖澹伴煶</option>`];
  voices.forEach((v, index) => {
    options.push(`<option value="${escapeHtml(v.id)}" ${selected === v.id ? "selected" : ""}>${escapeHtml(getVoiceDisplayName(v, index))}</option>`);
  });
  return options.join("");
}

function getShotVoiceLabel(voiceId) {
  if (!voiceId) return "榛樿璺熼殢鍏ㄧ墖澹伴煶";
  const voices = normalizeList(state.voices);
  const voiceIndex = voices.findIndex((v) => v.id === voiceId);
  const voice = voices[voiceIndex];
  if (!voice) return "璇ュ０闊虫。妗堜笉瀛樺湪";
  return `${getVoiceDisplayName(voice, voiceIndex)} 路 鍙敤`;
}

function getControlValue(primaryId, fallbackId, fallbackValue = "") {
  const primary = $(primaryId);
  if (primary && primary.value !== undefined) return primary.value;
  const fallback = $(fallbackId);
  if (fallback && fallback.value !== undefined) return fallback.value;
  return fallbackValue;
}

function getSelectedVoiceId() {
  return getControlValue("editorVoiceSelect", "ttsVoiceSelect", "");
}

function normalizeVoiceSpeed(value) {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return 1;
  return Math.min(1.5, Math.max(0.8, Math.round(parsed * 10) / 10));
}

function formatVoiceSpeed(value) {
  return `${normalizeVoiceSpeed(value).toFixed(1)}x`;
}

function getSelectedVoiceSpeed() {
  return normalizeVoiceSpeed(getControlValue("editorVoiceSpeed", "voiceSpeed", "1.0"));
}

function updateVoiceSpeedLabels() {
  const speed = getSelectedVoiceSpeed();
  if ($("editorVoiceSpeedValue")) $("editorVoiceSpeedValue").textContent = formatVoiceSpeed(speed);
  if ($("voiceSpeedValue")) $("voiceSpeedValue").textContent = formatVoiceSpeed(speed);
}

function syncPairedSelects(primaryId, fallbackId) {
  const primary = $(primaryId);
  const fallback = $(fallbackId);
  if (!primary || !fallback) return;
  const sync = (from, to) => {
    if (to.value !== from.value) to.value = from.value;
  };
  primary.addEventListener("change", () => {
    sync(primary, fallback);
    updateTitleTemplateHints();
  });
  fallback.addEventListener("change", () => {
    sync(fallback, primary);
    updateTitleTemplateHints();
  });
}

function syncPairedRanges(primaryId, fallbackId) {
  const primary = $(primaryId);
  const fallback = $(fallbackId);
  if (!primary || !fallback) return;
  const sync = (from, to) => {
    const value = normalizeVoiceSpeed(from.value).toFixed(1);
    if (from.value !== value) from.value = value;
    if (to.value !== value) to.value = value;
    updateVoiceSpeedLabels();
    scheduleWorkspaceDraftSave();
  };
  ["input", "change"].forEach((eventName) => {
    primary.addEventListener(eventName, () => sync(primary, fallback));
    fallback.addEventListener(eventName, () => sync(fallback, primary));
  });
  sync(primary, fallback);
}

function getTitleTemplateHint(style) {
  return titleTemplateLibrary[style] || titleTemplateLibrary["鏅鸿兘鎺ㄨ崘鏍峰紡"];
}

function getRecommendedTitleStyle() {
  const source = [
    state.activeTemplateCategory,
    $("resultTitle")?.value,
    $("resultScript")?.value,
    $("resultPrompts")?.value,
    $("videoTitle")?.value,
    $("videoScript")?.value,
    ...normalizeList(state.shots).flatMap((shot) => [shot.text, shot.visual]),
  ].join(" ");
  if (!source.trim()) return "鏅鸿兘鎺ㄨ崘鏍峰紡";
  if (/鍥㈣喘|鍥㈠崟|濂楅|浠锋牸|浼樻儬|绂忓埄|鍒板簵|涓嬪崟|璐拱|棰嗗彇/.test(source) || state.activeTemplateCategory === "鍥㈠崟鐭棰?) {
    return "鍥㈣喘鎴愪氦鏍囬";
  }
  if (/鍚屽煄|闄勮繎|鍩庡競|骞垮窞|娣卞湷|浣涘北|鍟嗗湀|涓嬬彮|澶╂皵|鍛ㄦ湯|鏈湴|闂ㄥ簵|鍒板簵/.test(source) || state.activeTemplateCategory === "鍚屽煄鐭棰?) {
    return "鍚屽煄鍦烘櫙鏍囬";
  }
  if (/閬垮潙|韪╁潙|鍒啀|涓嶈|绗竴娆鏂版墜|娉ㄦ剰|鐪熺浉|濂楄矾/.test(source)) {
    return "閬垮潙鎻愰啋鏍囬";
  }
  if (/涓轰粈涔坾鍑粈涔坾娌℃兂鍒皘绔熺劧|鍙嶅樊|鏅€殀浣嗘槸|鍘熸潵/.test(source)) {
    return "鍙嶅樊鎮康鏍囬";
  }
  if (/[涓?]涓獆[鍥?]涓獆[浜?]涓獆娓呭崟|鏍囧噯|姝ラ|鏂规硶/.test(source)) {
    return "鏁板瓧娓呭崟鏍囬";
  }
  if (/鐪熷疄|娴嬭瘎|浣撻獙|鍙嶉|妗堜緥|瀵规瘮|鍓嶅悗/.test(source)) {
    return "鐪熷疄娴嬭瘎鏍囬";
  }
  if (/鏁堟灉|缁撴灉|鏀瑰杽|鍙樺ソ|瑙ｅ喅|鎻愬崌/.test(source)) {
    return "缁撴灉鎵胯鏍囬";
  }
  return "鐥涚偣閽╁瓙鏍囬";
}

function getTitleRecommendationReason(style) {
  const map = {
    "鏅鸿兘鎺ㄨ崘鏍峰紡": "瀵煎叆鑴氭湰鍚庤嚜鍔ㄥ垽鏂爣棰樻柟鍚戙€?,
    "鐥涚偣閽╁瓙鏍囬": "褰撳墠鏂囨涓昏鍦ㄨ瀹㈡埛鍗＄偣锛屽厛鐢ㄧ棝鐐规姄鍋滅暀銆?,
    "鍙嶅樊鎮康鏍囬": "褰撳墠鍐呭鏈夊弽宸垨瑙ｉ噴閫昏緫锛岀敤鎮康鏇村鏄撹浜虹湅瀹屻€?,
    "鏁板瓧娓呭崟鏍囬": "褰撳墠鍐呭閫傚悎鎷嗘垚姝ラ鎴栨爣鍑嗭紝鏁板瓧鏍囬鏇村埄浜庢敹钘忋€?,
    "鍚屽煄鍦烘櫙鏍囬": "褰撳墠鍐呭甯﹀煄甯傘€侀棬搴楁垨闄勮繎鍦烘櫙锛岀敤鍚屽煄鍒囧彛鏇村鏄撳湀闄勮繎浜恒€?,
    "閬垮潙鎻愰啋鏍囬": "褰撳墠鍐呭鏈夋彁閱掑拰鏁欒偛灞炴€э紝鐢ㄩ伩鍧戞爣棰樻洿瀹规槗寤虹珛淇′换銆?,
    "缁撴灉鎵胯鏍囬": "褰撳墠鍐呭鏇村亸缁撴灉琛ㄨ揪锛岀敤缁撴灉鏍囬鑳介檷浣庣悊瑙ｆ垚鏈€?,
    "鐪熷疄娴嬭瘎鏍囬": "褰撳墠鍐呭鍋忎綋楠屻€佹渚嬫垨鍙嶉锛岀敤鐪熷疄娴嬭瘎鏍囬鏇磋嚜鐒躲€?,
    "鍥㈣喘鎴愪氦鏍囬": "褰撳墠鍐呭甯﹀椁愩€佺鍒╂垨鍒板簵杞寲锛岀敤鎴愪氦鏍囬鏇撮€傚悎鏀跺彛銆?,
  };
  return map[style] || map["鏅鸿兘鎺ㄨ崘鏍峰紡"];
}

function renderTitleRecommendation() {
  const style = getRecommendedTitleStyle();
  if ($("editorRecommendedTitleStyle")) $("editorRecommendedTitleStyle").textContent = style === "鏅鸿兘鎺ㄨ崘鏍峰紡" ? "绛夊緟鑴氭湰鍐呭" : `鎺ㄨ崘锛?{style}`;
  if ($("editorTitleTemplateHint")) {
    $("editorTitleTemplateHint").textContent = `${getTitleRecommendationReason(style)} ${getTitleTemplateHint(style)}`;
  }
  return style;
}

function updateTitleTemplateHints() {
  const scriptStyle = getControlValue("scriptTitleStyle", "editorTitleStyle", "鏅鸿兘鎺ㄨ崘鏍峰紡");
  const exportStyle = getControlValue("titleStyle", "editorTitleStyle", "鏅鸿兘鎺ㄨ崘鏍峰紡");
  if ($("scriptTitleTemplateHint")) $("scriptTitleTemplateHint").textContent = getTitleTemplateHint(scriptStyle);
  renderTitleRecommendation();
  if ($("titleTemplateHint")) $("titleTemplateHint").textContent = getTitleTemplateHint(exportStyle);
}

function renderVoiceOptions() {
  const selected = $("editorVoiceSelect")?.value || $("ttsVoiceSelect")?.value || "";
  const html = buildGlobalVoiceOptions(selected);
  if ($("ttsVoiceSelect")) $("ttsVoiceSelect").innerHTML = html;
  if ($("editorVoiceSelect")) $("editorVoiceSelect").innerHTML = html;
  renderVoiceList();
}

function getVoiceStatusLabel(status) {
  const map = {
    ready: "鍙敤",
    api_pending: "寰呴厤缃?API",
    api_failed: "鍏嬮殕澶辫触",
  };
  return map[status] || status || "寰呮帴鍏?;
}

function getVoiceDisplayName(voice, index = 0) {
  return `澹伴煶椤圭洰 ${index + 1}`;
}

function renderVoiceList() {
  const box = $("voiceList");
  if (!box) return;
  const voices = normalizeList(state.voices);
  if (!voices.length) {
    box.innerHTML = `<div class="voice-item muted">杩樻病鏈夊彲鐢ㄥ０闊?/div>`;
    return;
  }
  box.innerHTML = voices.map((voice, index) => {
    const displayName = getVoiceDisplayName(voice, index);
    return `<div class="voice-item ${voice.status === "ready" ? "ready" : ""}">
      <div>
        <strong>${escapeHtml(displayName)}</strong>
        <span>鍙敤 路 鍙敤浜庡壀杈戦厤闊?/span>
      </div>
      <button class="danger tiny-btn" type="button" data-delete-voice-id="${escapeHtml(voice.id)}">鍒犻櫎</button>
    </div>`;
  }).join("");
}

function renderMixPlan() {
  const container = $("mixPlan");
  if (!container) {
    renderEditorMaterialNotice();
    return;
  }
  if (!state.shots.length) {
    container.innerHTML = "";
    return;
  }
  ensureShots();
  const rows = state.shots.slice(0, 8).map((shot, index) => {
    const libraryId = resolveShotLibraryId(shot.libraryId, shot);
    const assets = getAssetsByGroup(libraryId);
    const preferred = assets.filter((asset) => asset.type === shot.materialType);
    const asset = preferred[0] || assets[0];
    const assetLabel = asset
      ? `${getAssetGroupName(libraryId)}锛?{asset.name}`
      : `${getAssetGroupName(libraryId)}锛氬緟涓婁紶`;
    return `<div class="timeline-item">
      <strong>闀滃ご ${index + 1}</strong>
      <div>
        <div>${escapeHtml(shot.text)}</div>
        <div class="meta">鐢婚潰锛?{escapeHtml(shot.visual)}</div>
        <div class="meta">瑙嗛搴撶礌鏉愶細${escapeHtml(assetLabel)}</div>
      </div>
    </div>`;
  });
  container.innerHTML = rows.join("");
  renderEditorMaterialNotice();
}

function renderEditorMaterialNotice() {
  const notice = $("editorMaterialNotice");
  if (!notice) return;
  if (!state.shots.length) {
    notice.classList.remove("hidden");
    notice.innerHTML = `<strong>鍓緫鍓嶅厛瀵煎叆闀滃ご</strong><span>璇峰厛鍒拌剼鏈〉鐢熸垚鏂囨鍜屽垎闀滐紝鍐嶇偣鍑烩€滃鍏ュ壀杈戦暅澶粹€濄€?/span>`;
    return;
  }
  ensureShots();
  const assets = normalizeList(state.assets);
  const voices = normalizeList(state.voices);
  const assetsByLibrary = groupAssetsByLibrary(assets);
  const requiredLibraryIds = Array.from(new Set(state.shots.map((shot) => resolveShotLibraryId(shot.libraryId, shot)).filter(Boolean)));
  const missingLibraryIds = assets.length
    ? requiredLibraryIds.filter((id) => !(assetsByLibrary[id] || []).length)
    : requiredLibraryIds;
  const missing = [];
  if (!assets.length) {
    missing.push("杩樻病鏈変笂浼犱换浣曡棰戠礌鏉?);
  } else if (missingLibraryIds.length) {
    const labels = missingLibraryIds.slice(0, 4).map((id) => getAssetGroupName(id)).join("銆?);
    missing.push(`缂哄皯 ${labels}${missingLibraryIds.length > 4 ? " 绛夎棰戝簱绱犳潗" : ""}`);
  }
  if (!voices.length) {
    missing.push("杩樻病鏈夊垱寤哄０闊虫。妗?);
  }
  notice.classList.toggle("hidden", !missing.length);
  const nextAction = (missingLibraryIds.length || !assets.length) && !voices.length
    ? "娣诲姞绱犳潗鍜屽０闊?
    : !voices.length
      ? "鍒涘缓澹伴煶妗ｆ"
      : "琛ラ綈瀵瑰簲瑙嗛搴撶礌鏉?;
  notice.innerHTML = missing.length
    ? `<strong>鍓緫鍓嶅厛琛ラ綈瑙嗛搴?/strong><span id="editorMaterialNoticeText">${escapeHtml(`${missing.join("锛?)}銆傝鍏堝埌瑙嗛搴?{nextAction}锛屽啀鍥炴潵鍋氶暅澶村尮閰嶃€俙)}</span>`
    : "";
}

function groupAssetsByType(assets) {
  return normalizeList(assets).reduce((acc, item) => {
    acc[item.type] = acc[item.type] || [];
    acc[item.type].push(item);
    return acc;
  }, {});
}

function groupAssetsByLibrary(assets) {
  return normalizeList(assets).reduce((acc, item) => {
    const id = getAssetLibraryId(item);
    acc[id] = acc[id] || [];
    acc[id].push(item);
    return acc;
  }, {});
}

function renderCockpit() {
  renderDashboardHeader();
  renderDashboardScriptRows();
  renderMaterialChecklist();
}

function renderDashboardHeader() {
  if (!$("dashboardDirection")) return;
  const service = $("copyRaw")?.value.trim();
  const style = $("copyStyle")?.value || "鎴愪氦鍨?;
  const title = $("resultTitle")?.value.trim();
  const goal = $("userGoal")?.value.trim();
  const audience = $("targetAudience")?.value.trim();
  $("dashboardDirection").textContent = title || service || `${style.replace("鍨?, "")}鍐呭 路 闂ㄥ簵鑾峰`;
  $("dashboardGoal").textContent = goal || (audience ? `鍚稿紩 ${audience} 鍒板簵鍜ㄨ骞朵綋楠宍 : "鍚稿紩 25-40 宀佸コ鎬у埌搴楀挩璇㈠苟浣撻獙");
  if ($("researchStateBadge")) {
    $("researchStateBadge").textContent = "璋冪爺瀹屾垚";
  }
}

function renderDashboardScriptRows() {
  const container = $("dashboardScriptRows");
  if (!container) return;
  const names = ["寮€鍦哄惛寮?, "闂鍏遍福", "鏂规灞曠ず", "鏁堟灉瀵规瘮", "琛屽姩鍙峰彫"];
  const durations = ["0:00 - 0:05", "0:05 - 0:15", "0:15 - 0:35", "0:35 - 0:50", "0:50 - 1:00"];
  const rows = state.shots.slice(0, 5).map((shot, index) => ({
    name: names[index] || `闀滃ご ${index + 1}`,
    duration: durations[index] || "",
    visual: shot.visual || assetTypeLabels[shot.materialType] || "闂ㄥ簵绱犳潗",
    text: shot.text || "琛ュ厖闀滃ご鏂囨",
  }));
  container.innerHTML = rows.map((row) => `
    <div class="script-row">
      <div>
        <strong>${escapeHtml(row.name)}</strong>
        <span>${escapeHtml(row.duration)}</span>
      </div>
      <div class="script-copy">
        <b>闀滃ご锛?/b>${escapeHtml(row.visual)}<br>
        <b>鏂囨锛?/b>${escapeHtml(row.text)}
      </div>
    </div>
  `).join("");
}

function renderMaterialChecklist() {
  const list = $("materialChecklist");
  if (!list) return;
  const assetsByType = groupAssetsByType(state.assets);
  const rows = cockpitMaterialRows.map((row) => {
    const matches = assetsByType[row.type] || [];
    return { ...row, count: matches.length, ready: matches.length > 0, matches };
  });
  const missing = rows.filter((row) => !row.ready).length;
  const ready = rows.length - missing;
  if ($("missingCount")) $("missingCount").textContent = `缂哄皯绱犳潗 ${missing} 椤筦;
  if ($("readyCount")) $("readyCount").textContent = `宸叉湁绱犳潗 ${ready} 椤筦;
  if ($("missingSummaryTitle")) $("missingSummaryTitle").textContent = missing ? `缂哄皯 ${missing} 椤瑰叧閿礌鏉恅 : "鍏抽敭绱犳潗宸茶ˉ榻?;
  if ($("missingSummaryText")) $("missingSummaryText").textContent = missing ? "寤鸿浼樺厛琛ラ綈缂哄彛锛屾彁鍗囪棰戣浆鍖栨晥鏋? : "鍙互杩涘叆鎴愬搧搴撳瓨锛岀敓鎴愬唴閮ㄦ紨绀鸿棰?;
  if ($("nextSuggestionText")) {
    $("nextSuggestionText").textContent = missing
      ? "瀹屽杽闀滃ご鑴氭湰骞跺噯澶囨墍闇€绱犳潗锛岃瑙嗛鏇村嚭褰?
      : "绱犳潗宸插熀鏈綈鍏紝鍙互杩涘叆鎴愬搧搴撳瓨";
  }
  if ($("suggestionActionBtn")) $("suggestionActionBtn").textContent = missing ? "鈥? : "鎴?;
  list.innerHTML = rows.map((row) => `
    <div class="material-row">
      <div class="material-title">
        <strong>${escapeHtml(row.title)}</strong>
        <span>${escapeHtml(row.subtitle)}</span>
      </div>
      <div class="status ${row.ready ? "ready" : "missing"}">${row.ready ? "鉁?宸叉湁" : "鈼?缂哄皯"}</div>
      <div>${row.count} ${row.type === "bgm" ? "棣? : "鏉?}</div>
      <div>${renderMaterialAction(row)}</div>
    </div>
  `).join("");
}

function renderMaterialAction(row) {
  if (!row.ready) {
    return `<button class="upload-chip" data-upload-type="${row.type}">锛?${escapeHtml(row.missingAction)}</button>`;
  }
  const shown = Math.min(row.count, 3);
  return `<div class="thumbs">${Array.from({ length: shown }).map(() => `<span class="thumb"></span>`).join("")}</div>`;
}

function syncExportFields() {
  if (!$("ttsText").value.trim()) $("ttsText").value = $("resultScript").value.trim();
  if (!$("videoTitle").value.trim()) $("videoTitle").value = $("resultTitle").value.trim();
  if (!$("videoScript").value.trim()) $("videoScript").value = $("resultScript").value.trim();
}

async function generateTts() {
  if (staticPreviewMode) {
    $("exportStatus").textContent = staticPreviewMessage;
    toast(staticPreviewMessage);
    return;
  }
  const renderShots = buildRenderShots();
  const text = $("ttsText").value.trim()
    ? buildVoiceoverText([], $("ttsText").value.trim())
    : buildVoiceoverText(renderShots, $("resultScript").value.trim());
  if (!text) {
    toast("鍏堢敓鎴愭垨濉啓閰嶉煶鏂囨湰");
    return;
  }
  $("exportStatus").textContent = "閰嶉煶鐢熸垚涓?..";
  const data = await api("/api/tts", {
    method: "POST",
    body: JSON.stringify({
      text,
      voiceId: getSelectedVoiceId(),
      voiceSpeed: getSelectedVoiceSpeed(),
    }),
  });
  $("exportStatus").textContent = "閰嶉煶宸茬敓鎴愶紝鍙互缁х画鐢熸垚鎴愮墖";
  state.lastRender = data.job;
  renderLatestExport();
  scheduleWorkspaceDraftSave();
  toast("閰嶉煶浠诲姟瀹屾垚");
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error("audio_read_failed"));
    reader.readAsDataURL(blob);
  });
}

async function createVoiceoverAsset(text, voiceId, voiceSpeed = 1) {
  if (!text || !voiceId) return null;
  $("exportStatus").textContent = "鍏嬮殕闊宠壊閰嶉煶鐢熸垚涓?..";
  const ttsData = await api("/api/tts", {
    method: "POST",
    body: JSON.stringify({ text, voiceId, voiceSpeed }),
  });
  const outputUrl = ttsData?.job?.outputUrl;
  if (!outputUrl) return null;
  $("exportStatus").textContent = "閰嶉煶宸茬敓鎴愶紝姝ｅ湪鍔犲叆鍓緫...";
  const response = await fetch(outputUrl);
  if (!response.ok) throw new Error("閰嶉煶鏂囦欢璇诲彇澶辫触");
  const blob = await response.blob();
  const dataUrl = await blobToDataUrl(blob);
  const ext = (outputUrl.match(/\.(mp3|wav|m4a|aac)(?:$|\?)/i)?.[1] || "mp3").toLowerCase();
  const assetData = await api("/api/assets", {
    method: "POST",
    body: JSON.stringify({
      name: `鑷姩閰嶉煶-${new Date().toISOString().replace(/[:.]/g, "-")}.${ext}`,
      type: "voiceover",
      libraryId: "ungrouped",
      dataUrl,
    }),
  });
  await loadAssets();
  return assetData.asset || null;
}

async function generateVideo() {
  if (staticPreviewMode) {
    $("exportStatus").textContent = staticPreviewMessage;
    toast(staticPreviewMessage);
    return false;
  }
  syncExportFields();
  if (!state.shots.length) {
    toast("璇峰厛鍦ㄨ剼鏈〉鐐瑰嚮鈥滃鍏ュ壀杈戦暅澶粹€濓紝鍐嶇敓鎴愭垚鐗?);
    return false;
  }
  const renderShots = buildRenderShots();
  const title = $("videoTitle").value.trim() || "鍐呴儴娴嬭瘯瑙嗛";
  const script = $("videoScript").value.trim();
  const voiceoverText = buildVoiceoverText(renderShots, script);
  if (!voiceoverText) {
    toast("鍏堢敓鎴愭垨濉啓瑙嗛鑴氭湰");
    return false;
  }
  const lipSyncMode = "off";
  const recommendedTitleStyle = getRecommendedTitleStyle();
  $("exportStatus").textContent = "鎴愮墖浠诲姟澶勭悊涓細姝ｅ湪鐢熸垚閰嶉煶鍜岃嚜鍔ㄥ壀杈?..";
  const voiceId = getSelectedVoiceId();
  const voiceSpeed = getSelectedVoiceSpeed();
  let assetIds = getRenderAssetIdsForShots();
  if (voiceId) {
    try {
      const voiceAsset = await createVoiceoverAsset(voiceoverText, voiceId, voiceSpeed);
      if (voiceAsset?.id) {
        assetIds = Array.from(new Set([...assetIds, voiceAsset.id]));
      }
    } catch (error) {
      toast(`閰嶉煶鐢熸垚澶辫触锛屽厛鐢熸垚鏃犻厤闊宠棰戯細${error.message}`);
    }
  }
  $("exportStatus").textContent = "鎴愮墖鍚堟垚涓紝璇蜂繚鎸侀〉闈㈡墦寮€...";
  const payload = {
    title,
    script: voiceoverText,
    voiceId,
    assetIds,
    shots: renderShots.map((shot) => ({ ...shot, voiceId: "" })),
    settings: {
      count: Number(getControlValue("renderCount", "", "1") || 1),
      subtitleStyle: "鐜孩楂樹寒瀛楀箷",
      titleStyle: recommendedTitleStyle,
      titleTemplateHint: getTitleTemplateHint(recommendedTitleStyle),
      bgmMode: getControlValue("editorBgmMode", "bgmMode", "鏅鸿兘鎺ㄨ崘 BGM"),
      voiceSpeed,
      lipSyncMode,
    }
  };
  const data = await api("/api/videos/generate", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  state.lastRender = data.job;
  $("exportStatus").textContent = data.job.status === "done" ? "鎴愮墖宸茬敓鎴愶紝鍙互涓嬭浇" : "鎴愮墖鐢熸垚澶辫触";
  renderLatestExport();
  toast(data.job.status === "done" ? "瑙嗛宸茬敓鎴? : "瑙嗛鐢熸垚澶辫触");
  return data.job.status === "done";
}

function getRenderAssetIdsForShots() {
  const libraryIds = new Set(state.shots.map((shot) => resolveShotLibraryId(shot.libraryId, shot)).filter(Boolean));
  const selectedIds = new Set(normalizeList(state.selectedLibraryAssetIds));
  const ids = normalizeList(state.assets)
    .filter((asset) => {
      const libraryMatch = libraryIds.has(getAssetLibraryId(asset));
      const selectedMatch = selectedIds.has(asset.id);
      const audioSupport = ["bgm", "voiceover"].includes(asset.type);
      return libraryMatch || selectedMatch || audioSupport;
    })
    .map((asset) => asset.id);
  return Array.from(new Set(ids));
}

async function oneClickEditVideo() {
  if (!state.shots.length) {
    toast("璇峰厛鍦ㄨ剼鏈〉鐐瑰嚮鈥滃鍏ュ壀杈戦暅澶粹€濓紝鍐嶄竴閿垚鍝佸壀杈?);
    switchTab("scriptTab");
    return;
  }
  syncExportFields();
  const button = $("oneClickEditBtn");
  if (button) {
    button.disabled = true;
    button.textContent = "姝ｅ湪鍓緫...";
  }
  startEditProgress();
  try {
    const ok = await generateVideo();
    stopEditProgress(ok);
    if (ok) switchTab("exportTab");
  } finally {
    if (editProgressTimer) stopEditProgress(false);
    if (button) {
      button.disabled = false;
      button.textContent = "涓€閿垚鍝佸壀杈?;
    }
  }
}

async function loadJobs() {
  const data = await api("/api/jobs");
  state.jobs = normalizeList(data.jobs).reverse();
  const validIds = new Set(getFinishedJobs(false).map((job) => getFinishedJobId(job)).filter(Boolean));
  state.selectedFinishedJobIds.forEach((id) => {
    if (!validIds.has(id)) state.selectedFinishedJobIds.delete(id);
  });
  if (!state.lastRender && state.jobs.length) {
    state.lastRender = state.jobs[0];
  }
  renderLatestExport();
}

function getFinishedJobId(job) {
  return String(job?.id || job?.outputUrl || job?.createdAt || "").trim();
}

function isFinishedVideoJob(job) {
  const url = String(job?.outputUrl || "").trim();
  if (!url) return false;
  const type = String(job?.type || "").toLowerCase();
  const isVideoUrl = /\.(mp4|mov|m4v|webm)(?:$|\?)/i.test(url);
  const isAudioUrl = /\.(mp3|wav|m4a|aac)(?:$|\?)/i.test(url);
  if (isAudioUrl) return false;
  if (type && type !== "video") return false;
  return isVideoUrl || String(job?.provider || "").includes("ffmpeg") || String(job?.provider || "").includes("editly");
}

function previewFrameUrl(url) {
  const value = String(url || "").trim();
  if (!value) return "";
  if (value.includes("#t=")) return value;
  return `${value}#t=0.2`;
}

function getFinishedJobs(includeLastRender = true) {
  const jobs = [];
  const seen = new Set();
  const source = includeLastRender ? [state.lastRender, ...normalizeList(state.jobs)] : normalizeList(state.jobs);
  source.forEach((job) => {
    if (!job) return;
    if (!isFinishedVideoJob(job)) return;
    const key = getFinishedJobId(job) || `${job.title}-${jobs.length}`;
    if (seen.has(key)) return;
    seen.add(key);
    jobs.push(job);
  });
  return jobs;
}

function renderLatestExport() {
  const container = $("latestExport");
  if (!container) return;
  const jobs = getFinishedJobs();
  updateFinishedToolbar(jobs);
  if (!jobs.length) {
    container.innerHTML = `<div class="finished-video-card">
      <div class="finished-video-preview">
        <div class="finished-video-empty">杩樻病鏈夋垚鐗?br>瀹屾垚鍓緫鍚庝細鑷姩淇濆瓨鍒拌繖閲?/div>
      </div>
      <div class="finished-video-body">
        <h3>绛夊緟鐢熸垚鎴愮墖</h3>
        <div class="meta">鐐瑰嚮鍓緫椤碘€滀竴閿垚鍝佸壀杈戔€濆悗锛岃繖閲屼細灞曠ず鎴愬搧鏁堟灉銆?/div>
      </div>
    </div>`;
    return;
  }
  container.innerHTML = jobs.slice(0, 12).map((job, index) => {
    const url = job.outputUrl || "";
    const cardPreviewUrl = previewFrameUrl(url);
    const isDone = job.status === "done" && url;
    const title = job.title || `鎴愬搧鏁堟灉 ${index + 1}`;
    const jobId = getFinishedJobId(job);
    const checked = state.selectedFinishedJobIds.has(jobId);
    return `<article class="finished-video-card ${checked ? "selected" : ""}">
      <div class="finished-video-preview" ${isDone ? `data-finished-preview-url="${escapeHtml(url)}" data-finished-preview-title="${escapeHtml(title)}"` : ""}>
        ${jobId ? `<label class="finished-card-select"><input type="checkbox" data-finished-job-check="${escapeHtml(jobId)}" ${checked ? "checked" : ""} aria-label="閫夋嫨鎴愮墖"></label>` : ""}
        ${isDone ? `<video src="${escapeHtml(cardPreviewUrl)}" muted playsinline preload="auto"></video><span class="finished-video-play">鐐瑰嚮棰勮</span>` : `<div class="finished-video-empty">${escapeHtml(job.status === "failed" ? "鐢熸垚澶辫触" : "鐢熸垚澶勭悊涓?)}</div>`}
        <span class="finished-video-badge">${escapeHtml(isDone ? "宸插畬鎴? : (job.status || "澶勭悊涓?))}</span>
      </div>
      <div class="finished-video-body">
        <h3>${escapeHtml(title)}</h3>
        <div class="meta">鐢熸垚鏃堕棿锛?{escapeHtml(job.createdAt || "-")}</div>
        <div class="meta">鍓緫鏈嶅姟锛?{escapeHtml(job.provider || "鑷姩鍓緫")}</div>
        ${job.error ? `<div class="meta">閿欒锛?{escapeHtml(job.error)}</div>` : ""}
        <div class="finished-video-actions">
          ${isDone ? `<button type="button" data-finished-preview-url="${escapeHtml(url)}" data-finished-preview-title="${escapeHtml(title)}">棰勮</button><a href="${escapeHtml(url)}" download>涓嬭浇</a>` : `<button type="button" disabled>绛夊緟</button><a aria-disabled="true">鏆傛棤</a>`}
          ${jobId ? `<button type="button" class="danger" data-delete-finished-job="${escapeHtml(jobId)}">鍒犻櫎</button>` : `<button type="button" disabled>鍒犻櫎</button>`}
        </div>
      </div>
    </article>`;
  }).join("");
  hydrateFinishedVideoPreviews(container);
  updateFinishedToolbar(jobs);
}

function hydrateFinishedVideoPreviews(container) {
  container.querySelectorAll(".finished-video-preview video").forEach((video) => {
    video.muted = true;
    video.playsInline = true;
    const seekToPreviewFrame = () => {
      const duration = Number(video.duration || 0);
      if (Number.isFinite(duration) && duration > 0.35) {
        try { video.currentTime = Math.min(0.2, Math.max(0.05, duration - 0.1)); } catch {}
      }
    };
    if (video.readyState >= 1) seekToPreviewFrame();
    else video.addEventListener("loadedmetadata", seekToPreviewFrame, { once: true });
    video.addEventListener("error", () => {
      const preview = video.closest(".finished-video-preview");
      if (!preview || preview.querySelector(".finished-video-empty")) return;
      const empty = document.createElement("div");
      empty.className = "finished-video-empty";
      empty.textContent = "瑙嗛鍔犺浇澶辫触";
      preview.appendChild(empty);
    }, { once: true });
  });
}

function updateFinishedToolbar(jobs = getFinishedJobs()) {
  const ids = jobs.map((job) => getFinishedJobId(job)).filter(Boolean);
  const selectedCount = ids.filter((id) => state.selectedFinishedJobIds.has(id)).length;
  const selectAll = $("selectAllFinishedJobs");
  const deleteBtn = $("deleteFinishedSelectedBtn");
  if (selectAll) {
    selectAll.disabled = !ids.length;
    selectAll.checked = Boolean(ids.length && selectedCount === ids.length);
    selectAll.indeterminate = Boolean(selectedCount && selectedCount < ids.length);
  }
  if (deleteBtn) {
    deleteBtn.disabled = !selectedCount;
    deleteBtn.textContent = selectedCount ? `鍒犻櫎閫変腑 ${selectedCount} 鏉 : "鍒犻櫎閫変腑";
  }
}

function setFinishedJobSelected(jobId, checked) {
  if (!jobId) return;
  if (checked) state.selectedFinishedJobIds.add(jobId);
  else state.selectedFinishedJobIds.delete(jobId);
  renderLatestExport();
}

function toggleAllFinishedJobs(checked) {
  getFinishedJobs().forEach((job) => {
    const id = getFinishedJobId(job);
    if (!id) return;
    if (checked) state.selectedFinishedJobIds.add(id);
    else state.selectedFinishedJobIds.delete(id);
  });
  renderLatestExport();
}

async function deleteFinishedJobs(jobIds) {
  const ids = normalizeList(jobIds).map((id) => String(id || "").trim()).filter(Boolean);
  if (!ids.length) {
    toast("璇峰厛閫夋嫨瑕佸垹闄ょ殑鎴愮墖");
    return;
  }
  if (!window.confirm(`纭鍒犻櫎 ${ids.length} 鏉℃垚鐗囧悧锛熷垹闄ゅ悗鎴愬搧搴撻噷涓嶄細鍐嶆樉绀恒€俙)) return;
  await api("/api/jobs/delete", {
    method: "POST",
    body: JSON.stringify({ jobIds: ids }),
  });
  ids.forEach((id) => state.selectedFinishedJobIds.delete(id));
  if (state.lastRender && ids.includes(getFinishedJobId(state.lastRender))) state.lastRender = null;
  await loadJobs();
  toast(`宸插垹闄?${ids.length} 鏉℃垚鐗嘸);
  scheduleWorkspaceDraftSave();
}

function openFinishedPreview(url, title = "鎴愮墖棰勮") {
  const modal = $("finishedPreviewModal");
  const video = $("finishedPreviewVideo");
  if (!modal || !video || !url) return;
  $("finishedPreviewTitle").textContent = title || "鎴愮墖棰勮";
  video.pause();
  video.src = String(url || "").split("#")[0];
  video.load();
  modal.classList.remove("hidden");
  video.play().catch(() => {});
}

function closeFinishedPreview() {
  const modal = $("finishedPreviewModal");
  const video = $("finishedPreviewVideo");
  if (video) {
    video.pause();
    video.removeAttribute("src");
    video.load();
  }
  modal?.classList.add("hidden");
}

function formatLipSyncStatus(job) {
  return "";
}

function formatSize(size) {
  const n = Number(size || 0);
  if (n >= 1024 * 1024 * 1024) return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
  if (n > 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  if (n > 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${n} B`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function bindActions() {
  $("loginBtn").addEventListener("click", login);
  $("loginPassword").addEventListener("keydown", (e) => {
    if (e.key === "Enter") login();
  });
  document.addEventListener("input", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (workspaceDraftExcludedIds.has(target.id)) return;
    if (target.matches("input, textarea, select")) scheduleWorkspaceDraftSave();
  });
  document.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (workspaceDraftExcludedIds.has(target.id)) return;
    if (target.matches("input, textarea, select")) scheduleWorkspaceDraftSave();
  });
  window.addEventListener("beforeunload", saveWorkspaceDraftNow);
  $("logoutBtn").addEventListener("click", () => {
    saveWorkspaceDraftNow();
    localStorage.removeItem("aivf_token");
    state.token = "";
    showLogin();
  });
  $("researchBtn").addEventListener("click", () => generateResearch(false).catch((e) => toast(e.message)));
  $("importDossierBtn").addEventListener("click", importResearchDossier);
  $("scriptBtn").addEventListener("click", () => generateScript().catch((e) => toast(e.message)));
  $("splitShotBtn").addEventListener("click", () => {
    if (splitScriptToShots()) {
      toast("宸叉寜鏂囨鍜屽垎闀滃鍏ュ壀杈戦暅澶?);
      switchTab("editorTab");
    }
  });
  $("toScriptBtn").addEventListener("click", () => {
    if (importResearchDossier()) switchTab("scriptTab");
  });
  $("toEditorBtn")?.addEventListener("click", () => {
    if (splitScriptToShots()) switchTab("editorTab");
  });
  $("templateSelect").addEventListener("change", () => {
    renderTemplatePreview();
    updateScriptSeriesFields();
    applyTemplateToScript(false);
  });
  $("scriptTitleStyle")?.addEventListener("change", () => {
    const value = $("scriptTitleStyle").value;
    if ($("editorTitleStyle")) $("editorTitleStyle").value = value;
    if ($("titleStyle")) $("titleStyle").value = value;
    updateTitleTemplateHints();
  });
  $("addShotBtn").addEventListener("click", addShot);
  $("editorAddShotBtn")?.addEventListener("click", addShot);
  $("autoMatchBtn").addEventListener("click", () => {
    if (splitScriptToShots()) toast("宸蹭粠鑴氭湰鍒嗛暅閲嶆柊瀵煎叆闀滃ご");
  });
  $("editorImportShotsBtn")?.addEventListener("click", () => {
    if (splitScriptToShots()) toast("宸蹭粠鑴氭湰鍒嗛暅閲嶆柊瀵煎叆闀滃ご");
  });
  syncPairedSelects("editorVoiceSelect", "ttsVoiceSelect");
  syncPairedSelects("editorBgmMode", "bgmMode");
  syncPairedRanges("editorVoiceSpeed", "voiceSpeed");
  updateVoiceSpeedLabels();
  updateTitleTemplateHints();
  $("uploadAssetBtn").addEventListener("click", () => uploadAsset().catch((e) => toast(e.message)));
  $("createAssetGroupBtn")?.addEventListener("click", () => createAssetGroup().catch((e) => toast(e.message)));
  $("assetLibrarySelect")?.addEventListener("change", (event) => {
    state.activeAssetGroupId = event.target.value || "ungrouped";
    localStorage.setItem("aivf_active_asset_group", state.activeAssetGroupId);
    renderAssetLibrary();
  });
  $("createVoiceBtn").addEventListener("click", () => createVoice().catch((e) => toast(e.message)));
  $("ttsBtn").addEventListener("click", () => generateTts().catch((e) => toast(e.message)));
  $("videoBtn").addEventListener("click", () => generateVideo().catch((e) => toast(e.message)));
  $("oneClickEditBtn")?.addEventListener("click", () => oneClickEditVideo().catch((e) => toast(e.message)));
  $("selectAllFinishedJobs")?.addEventListener("change", (event) => toggleAllFinishedJobs(event.target.checked));
  $("deleteFinishedSelectedBtn")?.addEventListener("click", () => deleteFinishedJobs([...state.selectedFinishedJobIds]).catch((e) => toast(e.message)));
  $("sidebarToggle").addEventListener("click", toggleSidebar);
  $("topExportBtn").addEventListener("click", () => switchTab("exportTab"));
  $("editorGoLibraryBtn")?.addEventListener("click", () => switchTab("libraryTab"));
  if ($("viewFullScriptBtn")) $("viewFullScriptBtn").addEventListener("click", () => switchTab("scriptTab"));
  if ($("suggestionActionBtn")) {
    $("suggestionActionBtn").addEventListener("click", () => {
      const missing = cockpitMaterialRows.some((row) => !(groupAssetsByType(state.assets)[row.type] || []).length);
      switchTab(missing ? "libraryTab" : "exportTab");
    });
  }
  $("fillMaterialBtn")?.addEventListener("click", () => switchTab("libraryTab"));
  document.addEventListener("click", (event) => {
    if (event.target.closest("[data-close-finished-preview]")) {
      closeFinishedPreview();
      return;
    }
    const finishedPreviewBtn = event.target.closest("[data-finished-preview-url]");
    if (finishedPreviewBtn) {
      if (event.target.closest("[data-finished-job-check]") || event.target.closest(".finished-card-select")) return;
      openFinishedPreview(finishedPreviewBtn.dataset.finishedPreviewUrl, finishedPreviewBtn.dataset.finishedPreviewTitle);
      return;
    }
    const deleteFinishedBtn = event.target.closest("[data-delete-finished-job]");
    if (deleteFinishedBtn) {
      deleteFinishedJobs([deleteFinishedBtn.dataset.deleteFinishedJob]).catch((e) => toast(e.message));
      return;
    }
    if (event.target.closest("[data-close-asset-modal]")) {
      closeAssetGroupModal();
      return;
    }
    const selectAssetBtn = event.target.closest("[data-select-asset-id]");
    if (selectAssetBtn) {
      toggleLibraryAssetSelection(selectAssetBtn.dataset.selectAssetId);
      return;
    }
    const deleteAssetBtn = event.target.closest("[data-delete-asset-id]");
    if (deleteAssetBtn) {
      deleteAsset(deleteAssetBtn.dataset.deleteAssetId).catch((e) => toast(e.message));
      return;
    }
    const deleteVoiceBtn = event.target.closest("[data-delete-voice-id]");
    if (deleteVoiceBtn) {
      deleteVoice(deleteVoiceBtn.dataset.deleteVoiceId).catch((e) => toast(e.message));
      return;
    }
    const groupBtn = event.target.closest("[data-asset-group-id]");
    if (groupBtn) {
      openAssetGroupModal(groupBtn.dataset.assetGroupId);
      return;
    }
    const btn = event.target.closest("[data-upload-type]");
    if (!btn) return;
    $("assetType").value = btn.dataset.uploadType;
    if ($("assetLibrarySelect") && state.activeAssetGroupId === "all") {
      $("assetLibrarySelect").value = "ungrouped";
    }
    switchTab("libraryTab");
    openAssetGroupModal(state.activeAssetGroupId === "all" ? "ungrouped" : state.activeAssetGroupId);
    toast(`宸插垏鍒?{assetTypeLabels[btn.dataset.uploadType] || "绱犳潗"}涓婁紶`);
  });
  document.addEventListener("change", (event) => {
    if (!(event.target instanceof HTMLElement)) return;
    const checkbox = event.target.closest("[data-finished-job-check]");
    if (!checkbox) return;
    setFinishedJobSelected(checkbox.dataset.finishedJobCheck, checkbox.checked);
  });
}

bindTabs();
bindActions();
restoreSession();
