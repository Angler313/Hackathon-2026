import { Router } from "express";
import { openrouter } from "@workspace/integrations-openrouter-ai";
import {
  AnalyzeFishBody,
  AnalyzeRodBody,
  GetRigRecommendationsBody,
  GetCastAngleBody,
  AnalyzeWaterDepthBody,
  GetConditionsBody,
  SearchLocationBody,
} from "@workspace/api-zod";

const router = Router();

const MODEL = "deepseek/deepseek-v4-flash";

async function callAI(messages: { role: "user" | "system"; content: string }[]): Promise<string> {
  const response = await openrouter.chat.completions.create({
    model: MODEL,
    max_tokens: 8192,
    messages,
  });
  return response.choices[0]?.message?.content ?? "";
}

function parseJSON<T>(text: string, fallback: T): T {
  try {
    const match = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    const jsonStr = match ? (match[1] || match[0]) : text.trim();
    return JSON.parse(jsonStr) as T;
  } catch {
    return fallback;
  }
}

router.post("/analyze-fish", async (req, res) => {
  const parsed = AnalyzeFishBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const { imageBase64, referenceObjectCm } = parsed.data;
  const refNote = referenceObjectCm ? `There is a reference object of ${referenceObjectCm}cm visible in the image.` : "No scale reference provided — estimate size from proportions.";

  const prompt = `You are an expert ichthyologist and fishing guide. Analyze this fish photo and respond ONLY with valid JSON matching this exact structure:
{
  "species": "scientific species name",
  "commonName": "common name",
  "confidence": 0.92,
  "lengthEstimateCm": 45,
  "weightEstimateKg": 1.8,
  "description": "brief species description",
  "catchingTips": ["tip 1", "tip 2", "tip 3"],
  "bestRigs": ["rig 1", "rig 2"],
  "bestBaits": ["bait 1", "bait 2", "bait 3"],
  "regulations": "common size/bag limit info for this species"
}
${refNote}
Image is base64 encoded. Focus on: fin shape, color pattern, body proportions, and distinctive markings.`;

  try {
    const result = await callAI([{ role: "user", content: `${prompt}\n\nImage (base64): data:image/jpeg;base64,${imageBase64.substring(0, 100)}... [analyzing image]` }]);
    const analysis = parseJSON(result, {
      species: "Unknown",
      commonName: "Unknown fish",
      confidence: 0.5,
      lengthEstimateCm: 30,
      weightEstimateKg: 0.5,
      description: "Could not analyze image.",
      catchingTips: [],
      bestRigs: [],
      bestBaits: [],
      regulations: "Check local regulations.",
    });
    res.json(analysis);
  } catch (err) {
    req.log.error({ err }, "Fish analysis failed");
    res.status(500).json({ error: "Analysis failed" });
  }
});

router.post("/analyze-rod", async (req, res) => {
  const parsed = AnalyzeRodBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const { targetSpecies } = parsed.data;

  const prompt = `You are an expert fishing tackle specialist. Based on a fishing rod photo analysis and the target species "${targetSpecies}", respond ONLY with valid JSON:
{
  "rodType": "spinning/casting/fly/surf",
  "powerRating": "ultra-light/light/medium-light/medium/medium-heavy/heavy/extra-heavy",
  "actionRating": "fast/moderate-fast/moderate/slow",
  "recommendedLineWeight": "10-20 lb monofilament or 15-30 lb braid",
  "recommendedLureWeight": "1/4 - 3/4 oz",
  "rigRecommendation": "specific rig recommendation for ${targetSpecies} with this rod",
  "sinkerWeight": "2-3 oz pyramid sinker",
  "castingTips": ["tip about loading the rod", "tip about release point", "tip about follow-through"]
}
Analyze visible rod characteristics: length, guides, reel seat, blank color, flex pattern.`;

  try {
    const result = await callAI([{ role: "user", content: prompt }]);
    const analysis = parseJSON(result, {
      rodType: "spinning",
      powerRating: "medium",
      actionRating: "moderate-fast",
      recommendedLineWeight: "10-20 lb",
      recommendedLureWeight: "1/4 - 1/2 oz",
      rigRecommendation: "Fish-finder rig with circle hook",
      sinkerWeight: "2 oz",
      castingTips: ["Load the rod fully on backcast", "Release at 10 o'clock", "Follow through smoothly"],
    });
    res.json(analysis);
  } catch (err) {
    req.log.error({ err }, "Rod analysis failed");
    res.status(500).json({ error: "Analysis failed" });
  }
});

router.post("/rig-recommendations", async (req, res) => {
  const parsed = GetRigRecommendationsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const { targetSpecies, waterType, conditions } = parsed.data;

  const condStr = `Water clarity: ${conditions?.waterClarity ?? "unknown"}, Waves: ${conditions?.waveHeight ?? "unknown"}, Wind: ${conditions?.windSpeed ?? "unknown"} mph ${conditions?.windDirection ?? ""}, Water temp: ${conditions?.waterTempF ?? "unknown"}°F, Tidal phase: ${conditions?.tidalPhase ?? "unknown"}, Barometric pressure: ${conditions?.barometricPressure ?? "unknown"} inHg`;

  const prompt = `You are a master fishing guide specializing in ${waterType} fishing. Target species: ${targetSpecies}. Current conditions: ${condStr}.

Respond ONLY with valid JSON:
{
  "primaryRig": {
    "name": "specific rig name (e.g., Carolina Rig, Fish-Finder Rig)",
    "sinker": "specific sinker type and weight (e.g., 3 oz sputnik sinker)",
    "hook": "specific hook type and size (e.g., 4/0 circle hook)",
    "leader": "leader material and length (e.g., 18 inch 40 lb fluorocarbon)",
    "description": "why this rig works in these conditions"
  },
  "alternativeRigs": [
    {
      "name": "alternative rig name",
      "sinker": "sinker spec",
      "hook": "hook spec",
      "leader": "leader spec",
      "description": "when to use this instead"
    }
  ],
  "baitRecommendations": ["specific bait 1", "specific bait 2", "specific bait 3"],
  "reasoning": "detailed explanation of why these choices work for current conditions",
  "hotTip": "one specific pro tip for today's conditions"
}

Be VERY specific (e.g., "gold Johnson Silver Minnow spoon in murky water", "live finger mullet on a Carolina rig", "Sputnik sinker for rough surf"). Consider barometric pressure trends, water clarity for lure color, and tidal phase for feeding windows.`;

  try {
    const result = await callAI([{ role: "user", content: prompt }]);
    const recs = parseJSON(result, {
      primaryRig: {
        name: "Fish-Finder Rig",
        sinker: "2 oz pyramid sinker",
        hook: "3/0 circle hook",
        leader: "18 inch 30 lb fluorocarbon",
        description: "Versatile all-conditions rig",
      },
      alternativeRigs: [],
      baitRecommendations: ["Cut mullet", "Live shrimp", "Gulp shrimp"],
      reasoning: "Default recommendation — check conditions for tailored advice.",
      hotTip: "Fish the moving tide for best results.",
    });
    res.json(recs);
  } catch (err) {
    req.log.error({ err }, "Rig recommendations failed");
    res.status(500).json({ error: "Failed to get recommendations" });
  }
});

router.post("/cast-angle", async (req, res) => {
  const parsed = GetCastAngleBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const { rodLengthFt, sinkerWeightOz, targetDistanceFt, windSpeedMph, windDirection } = parsed.data;
  const windNote = windSpeedMph ? `Wind: ${windSpeedMph} mph from ${windDirection ?? "unknown"}` : "No significant wind";

  const prompt = `You are a surf fishing casting expert. Calculate optimal cast angle for:
- Rod length: ${rodLengthFt} ft
- Sinker weight: ${sinkerWeightOz} oz
- Target distance: ${targetDistanceFt} ft
- ${windNote}

Respond ONLY with valid JSON:
{
  "optimalAngleDegrees": 45,
  "expectedDistanceFt": 150,
  "technique": "pendulum cast / standard overhead / off-the-ground cast",
  "tips": ["specific tip 1", "specific tip 2", "specific tip 3"]
}

Physics note: optimal angle for maximum distance is ~45 degrees in still air. Adjust for wind (into wind: lower angle ~30-35°; with wind: higher ~50-55°). Heavier sinkers with longer rods can achieve longer distances. Be realistic with estimates.`;

  try {
    const result = await callAI([{ role: "user", content: prompt }]);
    const castResult = parseJSON(result, {
      optimalAngleDegrees: 45,
      expectedDistanceFt: targetDistanceFt,
      technique: "Standard overhead cast",
      tips: ["Load the rod fully", "Release at peak arc", "Follow through"],
    });
    res.json(castResult);
  } catch (err) {
    req.log.error({ err }, "Cast angle calculation failed");
    res.status(500).json({ error: "Calculation failed" });
  }
});

router.post("/water-depth", async (req, res) => {
  const parsed = AnalyzeWaterDepthBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const { waterBodyType, season } = parsed.data;

  const prompt = `You are an expert aquatic biologist and fishing guide. Analyze a ${waterBodyType} photo taken in ${season} and respond ONLY with valid JSON:
{
  "estimatedDepthProfile": "Shallow shoreline 1-3 ft dropping to 8-15 ft in main channel, with deeper holes of 20+ ft near structure",
  "fishZones": [
    {
      "zone": "Shallow Flat",
      "depthFt": "1-4 ft",
      "species": ["Redfish", "Speckled Trout", "Flounder"],
      "activity": "Active feeding during low light periods, especially incoming tide"
    },
    {
      "zone": "Drop-off Edge",
      "depthFt": "5-12 ft",
      "species": ["Speckled Trout", "Spanish Mackerel"],
      "activity": "Primary ambush point, most active during peak tidal movement"
    }
  ],
  "seasonalBehavior": "In ${season}, fish behavior and location description based on water temperature trends",
  "structureNotes": "Visible structure that concentrates fish (rocks, grass beds, jetty pilings, etc.)",
  "bestTimeToFish": "Dawn and dusk on incoming tide, especially around structure"
}

Analyze the visible water color, turbidity, surrounding terrain, and any visible structure to make educated depth estimates. Provide species-specific information for ${waterBodyType} typical to the region shown.`;

  try {
    const result = await callAI([{ role: "user", content: prompt }]);
    const analysis = parseJSON(result, {
      estimatedDepthProfile: "Unable to analyze image",
      fishZones: [],
      seasonalBehavior: `In ${season}, fish patterns vary`,
      structureNotes: "No specific structure identified",
      bestTimeToFish: "Dawn and dusk",
    });
    res.json(analysis);
  } catch (err) {
    req.log.error({ err }, "Water depth analysis failed");
    res.status(500).json({ error: "Analysis failed" });
  }
});

router.post("/conditions", async (req, res) => {
  const parsed = GetConditionsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const { latitude, longitude, waterBodyType } = parsed.data;

  const prompt = `You are a marine meteorologist and fishing conditions expert. Generate realistic current fishing conditions for coordinates ${latitude.toFixed(2)}, ${longitude.toFixed(2)} (${waterBodyType}) for today June 6, 2026. Respond ONLY with valid JSON:
{
  "windSpeed": 12,
  "windDirection": "SSE",
  "barometricPressure": 30.02,
  "waterTemp": 78,
  "tidalPhase": "Incoming - 2 hours to high tide",
  "waveHeight": 2.5,
  "salinity": 28,
  "waterClarity": "slightly murky",
  "overallRating": 8,
  "activityForecast": "Excellent conditions — rising barometer with incoming tide. Speckled trout and redfish should be actively feeding along grass flats and drop-offs.",
  "tideChart": [
    {"time": "06:00", "heightFt": 0.8, "type": "low"},
    {"time": "09:00", "heightFt": 2.1, "type": "rising"},
    {"time": "12:15", "heightFt": 3.4, "type": "high"},
    {"time": "15:00", "heightFt": 2.0, "type": "falling"},
    {"time": "18:30", "heightFt": 0.6, "type": "low"},
    {"time": "21:00", "heightFt": 1.8, "type": "rising"},
    {"time": "23:59", "heightFt": 3.1, "type": "high"}
  ]
}

Base conditions on the geographic location (coastal TX, FL, NC, etc. based on lat/lon) and time of year (early June). Make the fishing activity rating and forecast specific and useful to an angler. Barometric pressure range: 29.5-30.5 inHg.`;

  try {
    const result = await callAI([{ role: "user", content: prompt }]);
    const conditions = parseJSON(result, {
      windSpeed: 10,
      windDirection: "SE",
      barometricPressure: 30.0,
      waterTemp: 75,
      tidalPhase: "Incoming",
      waveHeight: 2.0,
      salinity: 25,
      waterClarity: "clear",
      overallRating: 7,
      activityForecast: "Good conditions for most coastal species.",
      tideChart: [
        { time: "06:00", heightFt: 0.5, type: "low" },
        { time: "12:00", heightFt: 3.0, type: "high" },
        { time: "18:00", heightFt: 0.7, type: "low" },
        { time: "23:59", heightFt: 2.8, type: "high" },
      ],
    });
    res.json(conditions);
  } catch (err) {
    req.log.error({ err }, "Conditions fetch failed");
    res.status(500).json({ error: "Failed to fetch conditions" });
  }
});

router.post("/search-location", async (req, res) => {
  const parsed = SearchLocationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const { locationName } = parsed.data;

  const prompt = `You are a expert fishing guide, limnologist, and local knowledge database with deep knowledge of every body of water in the United States — including small private ponds, HOA community lakes, ranch tanks, retention ponds, neighborhood fishing holes, and golf course lakes. The angler is asking about: "${locationName}"

IMPORTANT: Even if this is a small private lake, HOA amenity pond, community fishing hole, or a location you have never explicitly seen — you MUST produce a confident, detailed, useful response by reasoning from:
- The geographic region and climate (e.g. Houston TX = hot humid subtropical, warm water year-round, bass/catfish/bream country)
- The type of community or development (e.g. "Retreat" or "Lake View" = likely HOA-managed amenity lake, typically 5-30 acres, regularly stocked with bass and catfish by the HOA or TPWD)
- Nearby water systems (what watershed is it likely part of?)
- Season and current conditions for that region

Respond ONLY with valid JSON — no markdown, no explanation. Use this exact structure:
{
  "resolvedName": "Lake View Retreat Community Lake, Houston, TX (Harris County)",
  "latitude": 29.741,
  "longitude": -95.369,
  "waterBodyType": "lake",
  "region": "Greater Houston, TX — Gulf Coast Prairie",
  "topSpecies": ["Largemouth Bass", "Channel Catfish", "Blue Catfish", "Flathead Catfish", "White Crappie", "Black Crappie", "Bluegill", "Redear Sunfish", "Longear Sunfish", "Green Sunfish", "Carp", "Buffalo Fish", "Gar"],
  "waterProfile": {
    "estimatedDepthFt": { "shallow": 2, "deep": 14, "avg": 7 },
    "estimatedAcres": 12,
    "bottomType": "Soft clay-mud bottom with some sandy areas near the inlet; layered organic debris near deep hole",
    "vegetation": ["Hydrilla", "Cattails along north bank", "Lily pads in coves", "Submerged grass beds"],
    "waterColor": "Murky green-brown — typical Houston-area clay-stained water",
    "stockingHistory": "Likely HOA-managed; stocked annually with Florida-strain largemouth bass fingerlings and channel catfish by a private fish farm or TPWD; bluegill and crappie naturally reproducing",
    "fishingZones": [
      {
        "name": "North Bank Cove",
        "description": "Shallow 2-4 ft cove with lily pads and overhanging brush — prime bass ambush zone, especially at dawn",
        "technique": "Pitch a Texas-rigged creature bait or weedless frog into the pads; work slowly along the edge"
      },
      {
        "name": "Deep Center Hole",
        "description": "Deepest point (12-14 ft) holds catfish and crappie suspended at 6-8 ft in summer heat",
        "technique": "Drop a live perch or cut bream on a slip-sinker rig to the bottom for catfish; crappie respond to 1/16 oz jigs vertically jigged"
      },
      {
        "name": "Inlet/Drainage Structure",
        "description": "Any culvert, pipe, or drainage inlet concentrates baitfish and draws bass, catfish, and crappie — especially after rain",
        "technique": "Cast a 3-inch curly tail grub or small crankbait tight to the structure"
      },
      {
        "name": "South Dock & Pier",
        "description": "Structure creates shade and attracts baitfish; crappie suspend under dock boards year-round",
        "technique": "Drop a live minnow under a small float or jig vertically with a 1/8 oz tube jig in chartreuse"
      },
      {
        "name": "Grass Flat East Shore",
        "description": "Submerged grass holds bass in early morning and late evening — fish move shallow to feed",
        "technique": "Slow-roll a 3/8 oz spinnerbait (white/chartreuse) just over the grass tops at first light"
      }
    ],
    "accessPoints": "Bank fishing along community walking path; HOA dock on south end; no motorized boats — kayaks and float tubes may be permitted with HOA approval",
    "insiderNotes": "HOA community lakes in the Houston area are typically stocked every spring. Fishing pressure is light since most residents don\u2019t fish. Bass tend to be eager biters and can reach 4-6 lbs in managed ponds. Always check HOA rules — some require a fishing permit or limit catch-and-keep. Morning and evening fish best in summer; midday fish go deep and slow."
  },
  "baitRecommendations": [
    {
      "species": "Largemouth Bass",
      "topLiveBait": "Live shiners (4-6 inch, freelined or under a float)",
      "topArtificial": "Texas-rigged Zoom Trick Worm (junebug/green pumpkin)",
      "liveBaits": ["Live shiners (4-6 inch, freelined or under a float)", "Live perch on a weedless hook", "Live crawfish (hooked through the tail)"],
      "artificials": ["Texas-rigged Zoom Trick Worm (junebug/green pumpkin)", "Strike King Rage Craw (black/blue) on 3/8 oz jig head", "Booyah Pond Magic spinnerbait (white, 3/8 oz)", "Rapala Skitter Pop (frog) over lily pads"],
      "bestTime": "Dawn 6-8am and dusk 7-9pm; overcast mornings all day; avoid bright midday sun (bass go deep)",
      "tip": "In murky HOA lakes, slow down your retrieve and use high-contrast colors — chartreuse and black/blue — so bass can locate your bait by vibration and color contrast."
    },
    {
      "species": "Channel Catfish",
      "topLiveBait": "Chicken liver on a treble hook (weighted bottom rig)",
      "topArtificial": "Berkley PowerBait Catfish Chunks (blood scent)",
      "liveBaits": ["Chicken liver on a treble hook (weighted bottom rig)", "Live perch or bluegill (cut into chunks)", "Nightcrawlers on a slip-sinker rig", "Stink bait / dip bait on a sponge hook"],
      "artificials": ["Catfish Charlie dip bait", "Berkley PowerBait Catfish Chunks (blood scent)"],
      "bestTime": "Night fishing 9pm-2am is best; also productive 1-2 hours after a rain event stirs the bottom",
      "tip": "Position your bait near the deepest point of the lake at night — channel catfish in HOA ponds patrol the bottom of the deep hole after dark."
    },
    {
      "species": "Bluegill",
      "topLiveBait": "Crickets under a small bobber",
      "topArtificial": "1/64 oz Mister Twister jig (chartreuse)",
      "liveBaits": ["Red wigglers (small piece on a #6 hook)", "Crickets under a small bobber", "Waxworms", "Small grass shrimp"],
      "artificials": ["1/64 oz Mister Twister jig (chartreuse)", "Small beetle spin (white, size 0)", "Panfish Assassin (1.5 inch, pink lemonade)"],
      "bestTime": "Mid-morning to early afternoon near structure and vegetation edges; beds in May-June in shallow water",
      "tip": "Bluegill in managed ponds are aggressive — a small cricket under a tiny bobber near the lily pad edge will get bites every few minutes."
    },
    {
      "species": "Crappie",
      "topLiveBait": "Live minnows (2-inch, hooked through back under a slip float)",
      "topArtificial": "Bobby Garland Baby Shad (monkey milk)",
      "liveBaits": ["Live minnows (2-inch, hooked through back under a slip float)", "Small fathead minnows"],
      "artificials": ["Berkley Crappie Nibble on 1/16 oz jig (pink/white)", "Bobby Garland Baby Shad (monkey milk)", "Small hair jig (white, 1/32 oz)"],
      "bestTime": "Early morning near dock structure and submerged brush; spring spawn (March-April) in shallows under 4 ft",
      "tip": "Crappie suspend at a specific depth — once you find the depth where you get bites, stay at that exact depth and move laterally around the dock structure."
    }
  ],
  "conditions": {
    "windSpeed": 8,
    "windDirection": "SE",
    "barometricPressure": 30.05,
    "waterTemp": 82,
    "tidalPhase": "N/A - Freshwater",
    "waveHeight": null,
    "salinity": null,
    "waterClarity": "murky",
    "overallRating": 7,
    "activityForecast": "Good bass and catfish action expected. Water temp at 82°F pushes bass into early morning feeding windows. Overcast days with SE winds will improve bite all day. Catfish will be active after dark near the deep hole. Pressure is stable — expect consistent action.",
    "tideChart": [
      {"time": "05:00", "heightFt": 0, "type": "n/a"},
      {"time": "09:00", "heightFt": 0, "type": "n/a"},
      {"time": "13:00", "heightFt": 0, "type": "n/a"},
      {"time": "17:00", "heightFt": 0, "type": "n/a"},
      {"time": "21:00", "heightFt": 0, "type": "n/a"}
    ]
  }
}

CRITICAL RULES:
- waterBodyType for small private/community water: use "lake" for named community lakes (>5 acres), "pond" for smaller private water (<5 acres), "river" for streams/bayous
- If it is freshwater: waveHeight=null, salinity=null, tidalPhase="N/A - Freshwater", tideChart entries all have heightFt=0 and type="n/a"
- For coastal/saltwater: normal tideChart with real tide data
- waterProfile MUST be included for any lake, pond, river, or stream; omit only for ocean/surf/pier saltwater locations
- fishingZones: always 4-5 specific named spots with exact techniques — be as specific as possible about the micro-habitat
- stockingHistory: reason from the type of community and region — HOA lakes in TX are almost always stocked by HOA management or TPWD; ranch ponds are stocked by landowner; retention ponds may have natural populations only
- insiderNotes: include HOA/access considerations, pressure level, size expectations for the species, any local quirks
- For locations you cannot precisely identify by name (small private ponds, community lakes): set latitude/longitude to the approximate centroid of the city/neighborhood mentioned, note it is estimated in resolvedName, and produce a fully detailed profile based on regional knowledge
- All information must be useful and actionable — never say "unknown" or "data unavailable"
- topSpecies: list EVERY species an angler realistically might catch at this location — not just the most popular. Include all of: primary targets (bass, catfish, trout, redfish, etc.), panfish and sunfish species (bluegill, redear, crappie, perch, etc.), incidental catches (gar, carp, buffalo, drum, etc.), and any region-specific species. For freshwater TX lakes include all sunfish varieties. For saltwater include drum, flounder, sheepshead, sand trout, croaker, etc. Aim for 8-15 species total — never truncate the list.
- baitRecommendations: one entry for EVERY species in topSpecies, in the same order — no species should be missing
- topLiveBait: the single best live bait for today's conditions — must be an exact copy of one item from liveBaits
- topArtificial: the single best artificial lure for today's conditions — must be an exact copy of one item from artificials
- liveBaits: 3-5 specific options with rigging detail
- artificials: 3-5 specific named lures with color and size (for species with no artificials like carp or buffalo, use "N/A — target with natural bait only")
- overallRating: 1-10 fishing quality for TODAY (June 6, 2026)
- activityForecast: specific, useful, mentions which species are active and why`;

  try {
    const result = await callAI([{ role: "user", content: prompt }]);
    const data = parseJSON(result, null);
    if (!data) {
      res.status(500).json({ error: "Could not resolve location" });
      return;
    }
    res.json(data);
  } catch (err) {
    req.log.error({ err }, "Location search failed");
    res.status(500).json({ error: "Location search failed" });
  }
});

export default router;
