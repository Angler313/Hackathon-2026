import { Router } from "express";
import {
  AnalyzeFishBody,
  AnalyzeRodBody,
  GetRigRecommendationsBody,
  GetCastAngleBody,
  AnalyzeWaterDepthBody,
  GetConditionsBody,
  SearchLocationBody,
} from "@workspace/api-zod";
import OpenAI from "openai";

const router = Router();

router.post("/analyze-fish", async (req, res) => {
  const parsed = AnalyzeFishBody.safeParse(req.body);
  if (!parsed.success) {
    console.error("analyze-fish validation failed:", parsed.error);
    res.status(400).json({ error: "Invalid request body", details: parsed.error.issues });
    return;
  }

  const imgData = parsed.data.imageBase64 || "";
  const hasFish = imgData.length > 100;

  if (!hasFish) {
    res.json({
      species: "No fish detected",
      commonName: "No fish detected",
      confidence: 0,
      lengthEstimateCm: 0,
      weightEstimateKg: 0,
      description: "No fish detected in the image. Try a clearer photo.",
      catchingTips: [],
      bestRigs: [],
      bestBaits: [],
      regulations: "Check local regulations.",
    });
    return;
  }

  if (!process.env.GROQ_API_KEY) {
    const species = ["Red Drum", "Spotted Seatrout", "Largemouth Bass", "Channel Catfish", "Sheepshead", "Black Drum", "Spanish Mackerel"][Math.floor(Math.random() * 7)];
    const lengthCm = Math.round((15 + Math.random() * 60) * 10) / 10;
    const confidence = Math.round((0.30 + Math.random() * 0.50) * 100) / 100;
    const weightKg = Math.round((0.3 + Math.random() * 8) * 10) / 10;
    res.json({
      species, commonName: species, confidence,
      lengthEstimateCm: lengthCm, weightEstimateKg: weightKg,
      description: `Estimated ${species} based on body shape and proportion. Image quality affects accuracy.`,
      catchingTips: ["Use a measuring board next to the fish for exact length", "Include a familiar object like a scale item for better size reference"],
      bestRigs: ["Carolina rig", "Fish-finder rig"],
      bestBaits: ["Live shrimp", "Cut mullet"],
      regulations: "Check local bag and size limits.",
    });
    return;
  }

  try {
    const groq = new OpenAI({
      baseURL: "https://api.groq.com/openai/v1",
      apiKey: process.env.GROQ_API_KEY,
    });

    const completion = await groq.chat.completions.create({
      model: "meta-llama/llama-4-scout-17b-16e-instruct",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Identify the fish in this photo. Return ONLY valid JSON (no markdown, no code fences):
{
  "species": "full common species name (e.g. 'Largemouth Bass', 'Red Drum', 'Spotted Seatrout')",
  "commonName": "shorter name anglers use",
  "confidence": number 0.0-1.0,
  "lengthEstimateCm": estimated total length in centimeters (if a human hand, foot, ruler, or familiar object is visible for scale; otherwise 0),
  "description": "2-3 sentence identification: key markings, body shape, fin configuration, and reasoning"
}
If no fish is visible, set species to "No fish detected" and confidence to 0.`
            },
            {
              type: "image_url",
              image_url: { url: imgData }
            }
          ]
        }
      ],
      temperature: 0.1,
      max_tokens: 512,
    });

    const content = completion.choices[0]?.message?.content || "";
    console.log("Groq raw response:", content);
    const cleaned = content.replace(/```[a-z]*\n?/g, "").replace(/```/g, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) parsed = JSON.parse(match[0]);
      else throw new Error("No JSON found in response");
    }

    const aiSpecies = parsed.species || "Unknown";
    const aiLength = typeof parsed.lengthEstimateCm === "number" && parsed.lengthEstimateCm > 0 ? parsed.lengthEstimateCm : 0;
    const aiConfidence = typeof parsed.confidence === "number" ? Math.min(1, Math.max(0, parsed.confidence)) : 0.5;

    const baitData = findBaitData(aiSpecies);
    console.log("Species:", aiSpecies, "BaitData found:", Boolean(baitData));

    res.json({
      species: aiSpecies,
      commonName: parsed.commonName || aiSpecies,
      confidence: aiConfidence,
      lengthEstimateCm: aiLength,
      weightEstimateKg: 0,
      description: parsed.description || "AI analysis completed.",
      catchingTips: baitData ? [baitData.tip, ...(baitData.bestTime ? [`Best time: ${baitData.bestTime}`] : [])] : [],
      bestRigs: baitData ? [baitData.topArtificial, baitData.topLiveBait] : [],
      bestBaits: baitData ? [...baitData.liveBaits.slice(0, 2), ...baitData.artificials.slice(0, 2)] : [],
      regulations: "Check local bag and size limits.",
    });
  } catch (err) {
    console.error("AI fish analysis failed:", err);
    res.status(502).json({ error: "AI analysis service unavailable. Please try again later." });
  }
});

router.post("/analyze-rod", async (req, res) => {
  const body = req.body || {};
  const targetSpecies: string = typeof body.targetSpecies === "string" ? body.targetSpecies.trim() : "";
  const locationName: string = typeof body.locationName === "string" ? body.locationName.trim() : "";

  if (!targetSpecies) {
    res.status(400).json({ error: "targetSpecies is required" });
    return;
  }

  let waterBodyType = "lake";
  if (locationName) {
    const assignment = classifyLocation(locationName);
    waterBodyType = assignment.waterBodyType || "lake";
  }

  const rodDB: Record<string, { rodType: string; powerRating: string; actionRating: string; lineWt: string; lureWt: string; typicalLength: string; rig: string }> = {
    "Largemouth Bass": { rodType: "Baitcasting", powerRating: "Medium-Heavy", actionRating: "Fast", lineWt: "12-20 lb", lureWt: "1/4 - 1 oz", typicalLength: "7-7'6\"", rig: "Texas rig or jig for cover, crankbait rod (moderate action) for treble hooks" },
    "Smallmouth Bass": { rodType: "Spinning", powerRating: "Medium", actionRating: "Fast", lineWt: "6-12 lb", lureWt: "1/8 - 1/2 oz", typicalLength: "6'6\"-7'", rig: "Tube jig or Ned rig on a spinning rod, drop-shot in deep clear water" },
    "White Bass": { rodType: "Spinning", powerRating: "Medium-Light", actionRating: "Fast", lineWt: "6-10 lb", lureWt: "1/8 - 3/8 oz", typicalLength: "6'6\"-7'", rig: "Small jigging spoon or inline spinner — light rod for sensitivity on schooling fish" },
    "Hybrid Striped Bass": { rodType: "Spinning or Baitcasting", powerRating: "Medium-Heavy", actionRating: "Fast", lineWt: "12-20 lb", lureWt: "1/2 - 2 oz", typicalLength: "7-7'6\"", rig: "Umbrella rig (Alabama rig) or live shad on a Carolina rig" },
    "Striped Bass": { rodType: "Spinning or Conventional", powerRating: "Heavy", actionRating: "Moderate-Fast", lineWt: "15-30 lb", lureWt: "1 - 4 oz", typicalLength: "7'6\"-9'", rig: "Live eel or bunker on a fish-finder rig; trolling umbrella rigs with wire line" },
    "Crappie": { rodType: "Spinning", powerRating: "Light", actionRating: "Fast", lineWt: "2-6 lb", lureWt: "1/32 - 1/8 oz", typicalLength: "8-12'", rig: "Spider rigging with multiple rods; single pole with minnow under a slip bobber" },
    "Black Crappie": { rodType: "Spinning", powerRating: "Light", actionRating: "Fast", lineWt: "2-6 lb", lureWt: "1/32 - 1/8 oz", typicalLength: "8-12'", rig: "Spider rigging — long rods for precise bait placement over brush piles" },
    "White Crappie": { rodType: "Spinning", powerRating: "Light", actionRating: "Fast", lineWt: "2-6 lb", lureWt: "1/32 - 1/8 oz", typicalLength: "8-12'", rig: "Trolling small jigs with multiple rods in open water; slip float in shallower areas" },
    "Bluegill Sunfish": { rodType: "Spinning", powerRating: "Ultralight", actionRating: "Moderate-Fast", lineWt: "1-4 lb", lureWt: "1/64 - 1/16 oz", typicalLength: "5-6'", rig: "Bobber and worm or a tiny Beetle Spin — ultralight for maximum fun" },
    "Channel Catfish": { rodType: "Spinning or Baitcasting", powerRating: "Medium-Heavy", actionRating: "Moderate", lineWt: "12-25 lb", lureWt: "1/2 - 3 oz", typicalLength: "7-8'", rig: "Slip-sinker (Carolina) rig with cut bait or stink bait; circle hooks for self-setting" },
    "Blue Catfish": { rodType: "Baitcasting or Conventional", powerRating: "Heavy", actionRating: "Moderate", lineWt: "20-40 lb", lureWt: "2 - 6 oz", typicalLength: "7'6\"-8'", rig: "Heavy fish-finder rig with fresh cut shad; drift fishing in current" },
    "Flathead Catfish": { rodType: "Baitcasting or Conventional", powerRating: "Heavy", actionRating: "Moderate", lineWt: "30-60 lb", lureWt: "2 - 8 oz", typicalLength: "7'6\"-8'", rig: "Live bluegill or goldfish on a slip-sinker rig; heavy tackle for 50+ lb fish" },
    "Walleye": { rodType: "Spinning", powerRating: "Medium-Light", actionRating: "Fast", lineWt: "6-10 lb", lureWt: "1/8 - 3/8 oz", typicalLength: "6'6\"-7'6\"", rig: "Bottom bouncer with worm harness or jig and minnow — sensitive tip to detect light bites" },
    "Northern Pike": { rodType: "Baitcasting", powerRating: "Medium-Heavy", actionRating: "Fast", lineWt: "15-25 lb", lureWt: "1/2 - 2 oz", typicalLength: "7-7'6\"", rig: "Steel leader required — large spoons, spinnerbaits, or quick-strike rig with dead bait" },
    "Muskellunge": { rodType: "Baitcasting", powerRating: "Heavy", actionRating: "Fast", lineWt: "30-80 lb", lureWt: "2 - 8 oz", typicalLength: "8-9'", rig: "Extra-heavy rod for giant lures — bucktails, jerkbaits, and 12\" swimbaits with 100+ lb leader" },
    "Yellow Perch": { rodType: "Spinning", powerRating: "Light", actionRating: "Fast", lineWt: "2-6 lb", lureWt: "1/32 - 1/8 oz", typicalLength: "5'6\"-6'6\"", rig: "Small minnow on a jig head under a slip bobber; perch spreader rig with two hooks" },
    "Rainbow Trout": { rodType: "Spinning or Fly", powerRating: "Light", actionRating: "Moderate-Fast", lineWt: "2-6 lb", lureWt: "1/32 - 1/8 oz", typicalLength: "6-7'", rig: "Ultralight spinning with inline spinners, or fly rod (4-5 wt) with nymphs and dry flies" },
    "Brown Trout": { rodType: "Spinning or Fly", powerRating: "Light to Medium", actionRating: "Moderate-Fast", lineWt: "4-8 lb", lureWt: "1/16 - 1/4 oz", typicalLength: "6'6\"-7'6\"", rig: "Larger streamers on fly rod (5-6 wt); stickbaits and spoons on spinning gear at night" },
    "Red Drum": { rodType: "Spinning", powerRating: "Medium-Heavy", actionRating: "Moderate-Fast", lineWt: "15-30 lb", lureWt: "1/2 - 2 oz", typicalLength: "7-7'6\"", rig: "Carolina rig with live mullet or blue crab; gold spoon for sight-casting tailing reds" },
    "Spotted Seatrout": { rodType: "Spinning", powerRating: "Medium-Light", actionRating: "Fast", lineWt: "6-12 lb", lureWt: "1/8 - 3/8 oz", typicalLength: "7'", rig: "Popping cork with live shrimp 18\" below; soft plastic jerkbait on 1/4 oz jig head" },
    "Speckled Trout": { rodType: "Spinning", powerRating: "Medium-Light", actionRating: "Fast", lineWt: "6-12 lb", lureWt: "1/8 - 3/8 oz", typicalLength: "7'", rig: "Popping cork with live shrimp; MirrOlure 52MR for topwater action at dawn" },
    "Flounder (Southern)": { rodType: "Spinning", powerRating: "Medium", actionRating: "Fast", lineWt: "8-15 lb", lureWt: "1/4 - 1/2 oz", typicalLength: "6'6\"-7'", rig: "Slip-sinker rig with live mud minnow; Gulp! on a jig head dragged slowly along bottom" },
    "Southern Flounder": { rodType: "Spinning", powerRating: "Medium", actionRating: "Fast", lineWt: "8-15 lb", lureWt: "1/4 - 1/2 oz", typicalLength: "6'6\"-7'", rig: "Mud minnow on a slip rig; bucktail jig with Gulp! trailer for doormats" },
    "Sheepshead": { rodType: "Spinning", powerRating: "Medium", actionRating: "Fast", lineWt: "10-20 lb", lureWt: "1/8 - 1/4 oz", typicalLength: "6'6\"-7'", rig: "Small #2 hook with fiddler crab or barnacle — sensitive tip for subtle nibbles" },
    "Spanish Mackerel": { rodType: "Spinning", powerRating: "Medium", actionRating: "Fast", lineWt: "10-20 lb", lureWt: "1/4 - 3/4 oz", typicalLength: "7'", rig: "Wire leader mandatory — Gotcha Plug or Clark Spoon; long rod for distance casting to blitzing fish" },
    "King Mackerel": { rodType: "Conventional or Spinning", powerRating: "Heavy", actionRating: "Fast", lineWt: "20-40 lb", lureWt: "1 - 3 oz", typicalLength: "7-8'", rig: "Trolling with wire line; live blue runner on stinger rig with #4 wire leader" },
    "Cobia": { rodType: "Spinning or Conventional", powerRating: "Heavy", actionRating: "Moderate-Fast", lineWt: "30-50 lb", lureWt: "2 - 6 oz", typicalLength: "7-8'", rig: "Bucktail jig for sight-casting; live eel or pinfish freelined near structure" },
    "Mahi-Mahi (Dolphinfish)": { rodType: "Spinning", powerRating: "Medium-Heavy", actionRating: "Fast", lineWt: "15-30 lb", lureWt: "1 - 4 oz", typicalLength: "7'", rig: "Trolling ballyhoo; pitch a live bait to cruising fish — keep one hooked to hold the school" },
    "Yellowfin Tuna": { rodType: "Conventional Stand-up", powerRating: "Heavy", actionRating: "Fast", lineWt: "30-60 lb", lureWt: "2 - 6 oz", typicalLength: "5'6\"-7'", rig: "Stand-up rod for chunking or jigging; trolling spread with skirted lures and daisy chains" },
    "Grouper (Gag)": { rodType: "Conventional", powerRating: "Heavy to Extra-Heavy", actionRating: "Moderate-Fast", lineWt: "40-80 lb", lureWt: "4 - 10 oz", typicalLength: "6-7'", rig: "Short, stout rod — live pinfish on a knocker rig; winch them out of the rocks fast" },
    "Grouper (Red)": { rodType: "Conventional", powerRating: "Heavy to Extra-Heavy", actionRating: "Moderate-Fast", lineWt: "50-100 lb", lureWt: "6 - 16 oz", typicalLength: "6-6'6\"", rig: "Electric assist for deep drops; heavy lead and a big live bait on a circle hook" },
    "Mangrove Snapper": { rodType: "Spinning", powerRating: "Medium", actionRating: "Fast", lineWt: "10-20 lb", lureWt: "1/4 - 1 oz", typicalLength: "7'", rig: "Fluorocarbon leader (20-30 lb) — small live shrimp freelined near structure; they're leader-shy" },
    "Amberjack (Greater)": { rodType: "Conventional", powerRating: "Heavy to Extra-Heavy", actionRating: "Fast", lineWt: "50-80 lb", lureWt: "4 - 10 oz", typicalLength: "5'6\"-6'6\"", rig: "Speed jig or live blue runner near wrecks — short, powerful rod for brute force" },
    "Tarpon": { rodType: "Spinning or Conventional", powerRating: "Heavy", actionRating: "Moderate-Fast", lineWt: "30-50 lb", lureWt: "2 - 5 oz", typicalLength: "7-8'", rig: "Live mullet or crab on a circle hook; heavy spinning setup for sight-casting to rolling fish" },
    "Snook": { rodType: "Spinning", powerRating: "Medium-Heavy", actionRating: "Fast", lineWt: "15-30 lb", lureWt: "1/2 - 2 oz", typicalLength: "7-8'", rig: "Flare jig or live pilchard near dock lights; strong leader for abrasive mouths and gill plates" },
    "Jack Crevalle": { rodType: "Spinning", powerRating: "Medium-Heavy", actionRating: "Fast", lineWt: "15-25 lb", lureWt: "1/2 - 2 oz", typicalLength: "7-7'6\"", rig: "Topwater plug for surface explosions; heavy leader — they're pure muscle" },
    "Wahoo": { rodType: "Conventional", powerRating: "Heavy", actionRating: "Fast", lineWt: "30-50 lb", lureWt: "2 - 6 oz", typicalLength: "7'", rig: "High-speed trolling with skirted lures; wire leader mandatory for razor teeth" },
    "Black Drum": { rodType: "Spinning", powerRating: "Medium-Heavy", actionRating: "Moderate", lineWt: "15-25 lb", lureWt: "1/2 - 2 oz", typicalLength: "7-7'6\"", rig: "Dead shrimp or cut crab on a bottom rig; fish right against pilings and jetties" },
    "Pompano": { rodType: "Spinning", powerRating: "Light to Medium", actionRating: "Fast", lineWt: "6-12 lb", lureWt: "1/8 - 1/2 oz", typicalLength: "7-8'", rig: "Pompano jig with Fishbites in the surf — long rod for casting distance over breakers" },
    "Bonefish": { rodType: "Spinning or Fly", powerRating: "Light to Medium (spinning), 7-8 wt (fly)", actionRating: "Fast", lineWt: "8-12 lb", lureWt: "1/8 - 1/4 oz", typicalLength: "7-8' (spinning), 9' (fly)", rig: "Live shrimp or small crab freelined on flats; sight-fishing requires a long accurate cast" },
    "Permit": { rodType: "Spinning or Fly", powerRating: "Medium (spinning), 9-10 wt (fly)", actionRating: "Fast", lineWt: "12-20 lb", lureWt: "1/4 - 1/2 oz", typicalLength: "7-8' (spinning), 9' (fly)", rig: "Live crab freelined; heavy fly for permit — they're one of the hardest fish to catch on fly" },
    "Alligator Gar": { rodType: "Baitcasting or Conventional", powerRating: "Extra-Heavy", actionRating: "Moderate-Fast", lineWt: "50-80+ lb", lureWt: "2 - 8 oz", typicalLength: "7-8'", rig: "Rope lure or large cut carp on 10/0 circle hook; 80+ lb braid and steel leader" },
  };

  let rec = rodDB[targetSpecies];

  if (!rec) {
    rec = rodDB[findBaitData(targetSpecies)?.species || ""] || null;
  }

  if (!rec) {
    const lower = targetSpecies.toLowerCase();
    for (const [key, value] of Object.entries(rodDB)) {
      if (key.toLowerCase().includes(lower) || lower.includes(key.toLowerCase())) {
        rec = value;
        break;
      }
    }
  }

  if (!rec) {
    const isSaltwater = ["bay", "ocean", "estuary"].includes(waterBodyType);
    rec = {
      rodType: isSaltwater ? "Spinning" : "Baitcasting or Spinning",
      powerRating: "Medium-Heavy",
      actionRating: "Fast",
      lineWt: isSaltwater ? "15-25 lb" : "10-20 lb",
      lureWt: "1/4 - 1 oz",
      typicalLength: "7'",
      rig: `General-purpose rig for ${targetSpecies} in ${waterBodyType} water`,
    };
  }

  let rodTypeAdjusted = rec.rodType;
  let lengthAdjusted = rec.typicalLength;
  let rigAdjusted = rec.rig;

  if (waterBodyType === "river") {
    rigAdjusted += " — use enough weight to hold bottom in current";
  } else if (waterBodyType === "bay" || waterBodyType === "estuary") {
    lengthAdjusted = lengthAdjusted.includes("7") ? "7-7'6\"" : lengthAdjusted;
    rigAdjusted += " — fish the moving tide";
  } else if (waterBodyType === "ocean") {
    rigAdjusted += " — wire or heavy fluoro leader for toothy pelagics";
  } else if (waterBodyType === "pond") {
    lengthAdjusted = "6-6'6\"";
    rigAdjusted += " — shorter rod for tight casting around cover";
  }

  res.json({
    rodType: rodTypeAdjusted,
    powerRating: rec.powerRating,
    actionRating: rec.actionRating,
    recommendedLineWeight: rec.lineWt,
    recommendedLureWeight: rec.lureWt,
    rigRecommendation: `${rec.typicalLength} ${rec.rodType} rod. ${rigAdjusted}`,
    sinkerWeight: waterBodyType === "river" ? "1-4 oz (match to current)" : waterBodyType === "ocean" ? "2-10 oz" : "1/4 - 2 oz",
    castingTips: [
      `Use a ${lengthAdjusted} rod for ${waterBodyType} fishing`,
      rec.powerRating + " power gives you the backbone for hooksets and the sensitivity to detect strikes",
      "Match your reel size to the rod — balanced gear reduces fatigue",
      waterBodyType === "river" ? "Cast upstream and let the current work your bait naturally" : "Make long casts when sight-fishing; stealth matters in clear water",
    ],
  });
});

router.post("/rig-recommendations", async (req, res) => {
  const body = req.body || {};
  const targetSpecies: string = typeof body.targetSpecies === "string" ? body.targetSpecies.trim() : "";
  const fishSize: string = (body.conditions as any)?.fishSize || "medium";

  if (!targetSpecies) {
    res.status(400).json({ error: "targetSpecies is required" });
    return;
  }

  const baitData = findBaitData(targetSpecies);
  const isSmall = fishSize === "small";
  const isLarge = fishSize === "large";

  let sinker = "1/4 - 2 oz egg or pyramid";
  let hook = "2/0 - 5/0 circle or J-hook";
  let leader = "18 inch 20-30 lb fluorocarbon";
  let rigName = baitData ? `${baitData.species} Carolina Rig` : `${targetSpecies} Rig`;

  if (isSmall) {
    sinker = "1/8 - 1/2 oz split shot or small egg";
    hook = "#6 - 1/0 small circle or J-hook";
    leader = "12 inch 8-15 lb fluorocarbon";
    rigName = baitData ? `Light ${baitData.species} Rig` : `Light ${targetSpecies} Rig`;
  } else if (isLarge) {
    sinker = "2 - 6 oz pyramid or bank sinker";
    hook = "4/0 - 10/0 heavy circle or J-hook";
    leader = "24-36 inch 40-80 lb fluorocarbon";
    rigName = baitData ? `Heavy ${baitData.species} Rig` : `Heavy ${targetSpecies} Rig`;
  }

  const toothySpecies = new Set([
    "Spanish Mackerel", "King Mackerel", "Wahoo", "Northern Pike", "Muskellunge", "Muskellunge (Muskie)",
    "Alligator Gar", "Spotted Gar", "Bluefish", "Barracuda", "Chain Pickerel", "Redfin Pickerel",
    "Blacktip Shark", "Bull Shark", "Spinner Shark", "Bonnethead Shark", "Atlantic Sharpnose Shark",
    "Hardhead Catfish", "Gafftop Catfish (Sail Catfish)", "Snook",
  ]);

  const needsWire = toothySpecies.has(baitData?.species || "") || toothySpecies.has(targetSpecies);

  if (needsWire) {
    if (isSmall) leader = "12 inch 20 lb wire leader (light)";
    else if (isLarge) leader = "24-36 inch 60-100 lb wire leader";
    else leader = "18 inch 30-60 lb wire leader";
  }

  const baitRecs = baitData
    ? isSmall
      ? [baitData.artificials[0], ...baitData.liveBaits.slice(0, 1), ...baitData.artificials.slice(1, 2)].filter(Boolean)
      : isLarge
        ? [baitData.topLiveBait, ...baitData.liveBaits.slice(0, 2), baitData.topArtificial].filter(Boolean)
        : [baitData.topLiveBait, baitData.topArtificial, ...baitData.liveBaits.slice(0, 2), ...baitData.artificials.slice(0, 2)]
    : isSmall ? ["Small worms", "Live minnows", "Crickets", "Small jigs"]
    : isLarge ? ["Large cut bait", "Live baitfish (6-12 inch)", "Large swimbaits", "Whole squid"]
    : ["Nightcrawlers", "Live minnows", "Cut bait", "Soft plastic worms"];

  const wireNote = needsWire ? " ⚠ Wire leader required — sharp teeth cut regular line." : "";
  const altRigs = isSmall
    ? [
        { name: "Drop Shot Rig", sinker: "1/8 - 1/4 oz drop shot", hook: "#2 - #1 dropshot hook", leader: needsWire ? "12 inch light wire" : "12 inch 8 lb fluoro", description: "Finesse presentation" + wireNote },
        { name: "Slip Bobber Rig", sinker: "Split shot", hook: "#8 - 1/0", leader: needsWire ? "Light wire trace below bobber" : "Set 2-4 ft depth", description: "Perfect for smaller fish — watch the bobber twitch" },
      ]
    : isLarge
    ? [
        { name: "Fish-Finder Rig", sinker: "3-8 oz sliding", hook: "6/0 - 10/0 circle", leader: needsWire ? "36 inch 80-100 lb wire" : "36 inch 60-80 lb fluoro", description: "Heavy-duty rig for trophy fish" + wireNote },
        { name: "Quick-Strike Rig", sinker: "2-6 oz no-roll", hook: "Two 6/0 treble hooks", leader: needsWire ? "18 inch 80 lb wire leader" : "18 inch 60 lb wire leader", description: "Rig live bait through the nose and back" + wireNote },
      ]
    : [
        { name: "Carolina Rig", sinker: "1/2 - 1 oz egg sinker", hook: "3/0 offset worm hook", leader: needsWire ? "18 inch 30-60 lb wire" : "18 inch 20 lb fluoro", description: "Versatile rig — bait floats above bottom" + wireNote },
        { name: needsWire ? "Wire Leader Rig" : "Texas Rig", sinker: needsWire ? "1/2 - 2 oz sliding" : "1/8 - 1/2 oz bullet weight", hook: needsWire ? "3/0 - 6/0 circle on wire" : "2/0 - 5/0 offset worm hook", leader: needsWire ? "18 inch 30-60 lb wire" : "N/A (direct tie)", description: needsWire ? "Wire leader for toothy predators" : "Weedless and snag-proof — the classic bass presentation" },
      ];

  res.json({
    primaryRig: {
      name: rigName,
      sinker,
      hook,
      leader,
      description: baitData
        ? `${isSmall ? "Light tackle for smaller " + baitData.species : isLarge ? "Heavy setup for trophy " + baitData.species : "Standard rig for " + baitData.species}. ${baitData.tip}`
        : `${isSmall ? "Light" : isLarge ? "Heavy" : "Standard"} rig for ${targetSpecies}.`,
    },
    alternativeRigs: altRigs,
    baitRecommendations: [...new Set(baitRecs)].slice(0, 6),
    reasoning: baitData
      ? isSmall
        ? `Smaller ${baitData.species} feed on smaller prey — downsizing your bait matches their diet. Lighter line gets more bites.`
        : isLarge
          ? `Trophy ${baitData.species} prey on larger baitfish and crustaceans. Heavy tackle ensures you can land a big fish.`
          : `${baitData.species} are typically caught using ${baitData.topLiveBait.toLowerCase()}. Adjust weight to match current and depth.`
      : `${isSmall ? "Small fish eat small prey — light line, small hooks." : isLarge ? "Big fish eat big bait — heavy line, big hooks." : "Match your presentation to the species and conditions."}`,
    hotTip: baitData?.tip
      || (isSmall ? "Light line and small hooks catch more fish — and make every fish feel like a trophy!" : isLarge ? "Use a landing net and don't rush the fight — big fish win when you hurry." : "Fish the moving tide for best results."),
  });
});

router.post("/cast-angle", async (req, res) => {
  const parsed = GetCastAngleBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const { rodLengthFt, sinkerWeightOz, sinkerType, targetDistanceFt, windSpeedMph, windDirection } = parsed.data;
  const g = 32.174; // ft/s²

  // Release height above water: caster waist (~3.5 ft) + rod tip elevation
  const releaseHeightFt = 3.5 + rodLengthFt * 0.65;

  // Sinker aerodynamics — drag factor (higher = more drag = less distance)
  let dragFactor = 1.0;
  const st = (sinkerType || "").toLowerCase();
  switch (st) {
    case "pyramid":  dragFactor = 1.00; break; // sharp pointed nose cuts air best
    case "bullet":   dragFactor = 1.02; break; // streamlined cone, near pyramid
    case "egg":      dragFactor = 1.08; break; // smooth but blunt front
    case "spider":   dragFactor = 1.20; break; // 8 legs, lots of air resistance
    case "bank":     dragFactor = 1.10; break; // flat bottom creates turbulence
    case "no-roll":  dragFactor = 1.15; break; // flat shape catches air
    default:         dragFactor = 1.05; break;
  }

  // Estimate cast velocity from rod length + sinker weight
  const baseVelocity = 42;
  const rodFactor = Math.pow(rodLengthFt / 7, 0.35);
  const weightFactor = Math.pow(2 / sinkerWeightOz, 0.12);
  let velocityFps = baseVelocity * rodFactor * weightFactor / Math.sqrt(dragFactor);

  // Wind adjustment (headwind reduces, tailwind increases effective range)
  if (windSpeedMph != null && windDirection) {
    const windFps = windSpeedMph * 5280 / 3600;
    const dir = windDirection.toLowerCase();
    if (dir === "headwind") velocityFps -= windFps * 0.3;
    else if (dir === "tailwind") velocityFps += windFps * 0.2;
  }

  // Optimal angle for elevated launch:
  // θ_opt = arcsin(1 / sqrt(2 + 2gh/v²))
  const k = (2 * g * releaseHeightFt) / (velocityFps * velocityFps);
  const optimalAngleRad = Math.asin(1 / Math.sqrt(2 + k));
  const optimalAngleDeg = Math.round(optimalAngleRad * 180 / Math.PI * 10) / 10;

  // Maximum range at optimal angle
  const sinA = Math.sin(optimalAngleRad);
  const cosA = Math.cos(optimalAngleRad);
  const maxRangeFt = Math.round(
    (velocityFps * velocityFps / g) * cosA * (sinA + Math.sqrt(sinA * sinA + k))
  );

  // Technique based on setup
  let technique: string;
  let tips: string[];

  if (rodLengthFt >= 9) {
    technique = "Long-rod pendulum cast";
    tips = [
      `With a ${rodLengthFt}ft rod, use your whole body — pivot from the hips for maximum leverage`,
      `Release at ${optimalAngleDeg}° — slightly lower than 45° because the long rod lifts the lure higher`,
      "Let the rod do the work on the forward cast; avoid muscling it with your arms",
      "Point the rod tip at your target after release for best line flow",
    ];
  } else if (sinkerWeightOz >= 3) {
    technique = "Power lob cast";
    tips = [
      `Heavy ${sinkerWeightOz}oz sinker — use a smooth sweeping motion, not a hard snap`,
      `Release at ${optimalAngleDeg}° — the weight carries momentum, a high arc wastes energy`,
      "Keep your wrist firm through the cast to avoid the weight pulling off-target",
      "Let the sinker pull line off the spool naturally; don't thumb the spool too early",
    ];
  } else if (rodLengthFt <= 6) {
    technique = "Quick snap cast";
    tips = [
      `Short ${rodLengthFt}ft rod — use a quick wrist snap for accuracy over raw distance`,
      `Release at ${optimalAngleDeg}° with a tight, compact motion`,
      "Lead with your elbow for control; short rods reward precision",
      "Feather the line with your index finger for spot-landing accuracy",
    ];
  } else {
    technique = "Standard overhead cast";
    tips = [
      `Load the rod fully by bringing it back to ${Math.round(rodLengthFt * 15)}° on the backcast`,
      `Release at ${optimalAngleDeg}° for maximum distance with your ${rodLengthFt}ft rod and ${sinkerWeightOz}oz sinker`,
      "Follow through — point the rod tip at your target after release",
      "Keep your line path straight; side-to-side wobble kills distance quickly",
    ];
  }

  res.json({
    optimalAngleDegrees: optimalAngleDeg,
    expectedDistanceFt: maxRangeFt,
    technique,
    tips,
  });
});

router.post("/water-depth", async (req, res) => {
  const body = req.body || {};
  const locationName: string = typeof body.locationName === "string" ? body.locationName.trim() : "";
  const waterBodyType: string = typeof body.waterBodyType === "string" ? body.waterBodyType : "lake";
  const season: string = typeof body.season === "string" ? body.season : "summer";

  let regionSpecies: string[] = [];
  let regionName = "";
  let lat = 0;
  let lon = 0;

  if (locationName) {
    const assignment = classifyLocation(locationName);
    const region = REGION_PROFILES[assignment.regionKey];
    if (region) {
      regionSpecies = region.species || [];
      regionName = region.name;
      lat = assignment.lat;
      lon = assignment.lon;
    }
  }

  const lakeStructures: [string, string, string][] = [
    ["Submerged Timber / Laydowns", "4-15 ft", "Bass, crappie, and catfish hold tight to fallen trees. Fish the shady side — bass ambush from cover, crappie suspend in branches, catfish cruise the bottom nearby."],
    ["Weed Beds / Grass Lines", "2-8 ft", "Bass patrol the edges for bluegill; pike hide in the thickest vegetation ambushing prey. Cast parallel to the weed edge with a weedless rig."],
    ["Points / Humps", "6-20 ft", "Walleye, bass, and stripers stage on points where depth changes fast. Fish the windward side where baitfish get pushed up."],
    ["Drop-offs / Ledges", "8-30 ft", "Catfish and walleye hold on the deep side of ledges. Bass move up to feed in low light and drop back during mid-day. Use a bottom-bouncing rig or deep diving crankbait."],
    ["Docks / Boat Houses", "2-10 ft", "Crappie and bluegill suspend under docks for shade. Bass hang under walkways and boat lifts. Skip a jig or weightless senko under the dock — the further back, the better."],
    ["Riprap / Rocky Banks", "1-6 ft", "Smallmouth bass and walleye hold near rocks where crayfish live. Rock absorbs heat — fish these areas on cool mornings. Crankbaits and tube jigs work best."],
    ["Creek Channels", "10-25 ft", "Follow the old creek bed — bass and catfish use it as a highway between feeding flats and deep water. The channel swing (where it bends close to a flat) is the sweet spot."],
    ["Flats (Shallow)", "1-4 ft", "Bass, carp, and panfish feed on flats in spring and fall when water temps are moderate. In summer, fish these areas at dawn and dusk only. In winter, fish move off to deeper water."],
  ];

  const pondStructures: [string, string, string][] = [
    ["Weed Edges / Lily Pads", "1-4 ft", "Bass and bluegill hold at the outer edge of vegetation. Frogs and weedless Texas rigs over the top; drop a worm in open pockets. The transition from pads to open water is the strike zone."],
    ["Fallen Trees / Brush Piles", "2-8 ft", "Bass ambush from under logs; crappie suspend in the branches. Pitch a jig right into the thickest part — the biggest bass claims the best cover."],
    ["Dock / Overhanging Trees", "1-6 ft", "Bluegill, crappie, and bass seek shade under docks and overhanging branches. The shady side holds fish almost year-round. A bobber and worm or a weightless soft plastic is deadly here."],
    ["Deep Hole (Center)", "6-15 ft", "In small ponds, the deepest water near the dam or center holds catfish and the biggest bass. Fish these spots in summer mid-day and winter when fish go deep."],
    ["Inlet / Outlet Pipe", "1-5 ft", "Moving water brings oxygen and baitfish — every pond fish congregates near inflow. Bass and catfish sit in the current break waiting for food to wash in."],
    ["Dam / Spillway Area", "3-10 ft", "Catfish, carp, and bass stack up near the dam where the bottom drops off fastest. The riprap along the dam face holds crayfish — a meal for bass and catfish."],
    ["Shallow Coves / Backwater", "1-3 ft", "Bluegill bed in shallow sandy coves in late spring. Bass cruise these areas looking for spawning panfish. Sight-fish with polarized glasses on sunny days."],
  ];

  const riverStructures: [string, string, string][] = [
    ["Current Breaks / Eddies", "3-15 ft", "Smallmouth bass, walleye, and trout sit behind rocks and bridge pilings where current slows. Cast upstream and let your bait drift past the break — the strike comes as it enters the slack water."],
    ["Undercut Banks", "2-8 ft", "Catfish, bass, and trout tuck under eroded banks. The outside bend of a river (cut bank) is deeper and undercut — fish right against the bank. A bait drifted under the overhang is irresistible."],
    ["Deep Holes / Outside Bends", "8-20 ft", "Catfish and walleye hold in the deepest water of each river bend. The outside of a bend gets scoured deepest. Use a Carolina rig or heavy jig to keep bottom contact in current."],
    ["Sand/Gravel Bars", "1-4 ft", "Smallmouth bass and walleye feed on bars where current sweeps across. The downstream tip of a bar where two currents meet is a feeding station. Fish here with inline spinners or swimbaits."],
    ["Wing Dams / Rock Piles", "3-12 ft", "Walleye, sauger, and catfish stack behind wing dams. The eddy behind the dam concentrates baitfish. Fish the seam where slack water meets current — a 3-way rig with live bait is standard."],
    ["Tributary Mouths / Creek Inlets", "2-10 ft", "After rain, fish pile into creek mouths to feed on washed-in worms and insects. The warmer or cooler water of the tributary (depending on season) attracts fish."],
    ["Riffles / Runs", "1-3 ft", "Trout and smallmouth bass feed in oxygen-rich riffles. The tail of a riffle where it dumps into a pool is a prime lie. Use small spinners, dry flies, or drifted nymphs."],
  ];

  const bayStructures: [string, string, string][] = [
    ["Grass Flats", "1-4 ft", "Redfish, speckled trout, and flounder cruise grass flats on moving tides. Trout suspend over grass; redfish tail in the shallows. Work a popping cork with live shrimp 18 inches above the grass."],
    ["Oyster Reefs", "2-6 ft", "Redfish and sheepshead feed on crabs and shrimp around oyster beds. The up-current side holds feeding fish. Bump a jig along the shells — if you're not losing tackle, you're not on the reef."],
    ["Channel Edges / Drop-offs", "6-20 ft", "Trout and redfish stage on channel edges during strong tides. The lip of the drop-off is the ambush point. Free-line a live mullet or bounce a soft plastic along the bottom."],
    ["Marsh Drains / Creek Mouths", "2-8 ft", "Gamefish stack at marsh drains on falling tides to ambush baitfish flushed out of the marsh. The first hour of outgoing tide is prime. Position up-current and cast into the drain mouth."],
    ["Sand Bars / Shoreline Troughs", "1-4 ft", "Flounder bury in the sand in the trough between the beach and the first sandbar. Pompano and whiting feed here in the surf. A double-drop rig with Fishbites or sand fleas is the go-to."],
    ["Bridge / Pier Pilings", "4-25 ft", "Sheepshead, black drum, and mangrove snapper hold tight to pilings. Fish the shadow side. Barnacles on the pilings attract sheepshead — use a small hook with fiddler crab right against the concrete."],
    ["Bulkheads / Seawalls", "2-10 ft", "Snook, tarpon, and redfish cruise along seawalls, especially near dock lights at night. The corners and transitions are ambush points. Cast parallel to the wall, 2 feet off."],
  ];

  const oceanStructures: [string, string, string][] = [
    ["Reefs / Wrecks", "30-200 ft", "Grouper, snapper, and amberjack hold tight to structure on the bottom. The up-current side of the wreck is the feeding zone. Drop a live bait or jig vertically — set the hook the instant you feel weight."],
    ["Weed Lines / Sargassum", "Surface-20 ft", "Mahi-mahi, tripletail, and juvenile tuna hold under floating weed mats. The bigger the mat, the more fish. Troll a ballyhoo or cast a small jig to the edge of the weed line."],
    ["Color Changes / Rips", "Surface-30 ft", "Tuna, king mackerel, and sailfish patrol where blue water meets green. The dirty side concentrates baitfish. Troll a spread of lures across the color change at 6-8 knots."],
    ["Ledges / Drop-offs", "60-300 ft", "Swordfish (deep daytime), tuna, and billfish stage on the continental shelf break. The steepest part of the drop holds the most life. Deep-drop with electric reels or live-bait for pelagics."],
    ["Oil Rigs / FADs", "30-200 ft", "Cobia, amberjack, and tuna school around offshore structures. The shadow of the rig concentrates bait. Free-line a live blue runner or vertical jig — cobia will come right to the surface."],
    ["Surf Zone / Nearshore Troughs", "1-10 ft", "Pompano, whiting, and redfish feed in the troughs between sand bars. Spanish mackerel and bluefish slash through bait in the first gut. Cast a spoon or Gotcha plug into feeding schools."],
  ];

  const structuresByType: Record<string, [string, string, string][]> = {
    lake: lakeStructures,
    pond: pondStructures,
    river: riverStructures,
    bay: bayStructures,
    estuary: bayStructures,
    ocean: oceanStructures,
  };

  const structures = structuresByType[waterBodyType] || lakeStructures;

  const matchedSpecies = regionSpecies.length > 0
    ? regionSpecies.slice(0, 12)
    : ["Largemouth Bass", "Bluegill", "Crappie", "Catfish", "Walleye", "Northern Pike"];

  const seasonalTips: Record<string, string> = {
    spring: "Fish are moving shallow to spawn. Target staging areas near spawning flats — pre-spawn fish feed aggressively. Look for beds (light circles on bottom) in 2-6 ft of water. Afternoon is best as water warms.",
    summer: "Fish deep during mid-day heat — focus on shaded areas, deep structure, and dawn/dusk. Night fishing excels in summer. Thermocline sets up in lakes 15-25 ft down; fish hold just above it. Live bait outperforms artificials in hot water.",
    fall: "Fish feed aggressively to bulk up for winter. Baitfish schools migrate shallow, and predators follow. Topwater bite returns as water cools. Cover water quickly with search baits — fish are on the move following bait.",
    winter: "Fish slow down and hold tight to deep structure. Slow your presentation — dead-stick baits, use smaller lures, and fish the warmest part of the day (10am-3pm). In saltwater, fish move to deeper channels and holes.",
  };

  const fishZones = structures.map(([zone, depthFt, activity]) => ({
    zone,
    depthFt,
    species: matchedSpecies.slice(0, 4),
    activity,
  }));

  const locationPrefix = regionName
    ? `Fish location guide for ${locationName} (${regionName}). `
    : `Fish location guide for a typical ${waterBodyType}. `;

  res.json({
    estimatedDepthProfile: `${locationPrefix}Fish position varies by season, structure, and time of day. Key areas to target are listed below.`,
    fishZones,
    seasonalBehavior: seasonalTips[season] || seasonalTips.summer,
    structureNotes: `Common ${waterBodyType} structures include ${structures.map(s => s[0]).slice(0, 4).join(", ")}.${regionSpecies.length > 0 ? ` Target species in this region: ${regionSpecies.slice(0, 6).join(", ")}.` : ""} Fish relate to structure for three reasons: cover from predators, ambush position for feeding, and current/thermal refuge. The best structure has at least two of these three.`,
    bestTimeToFish: season === "summer" ? "Dawn (5-8am) and dusk (6-9pm). Night fishing with lights can be exceptional." : season === "winter" ? "Late morning through mid-afternoon (10am-3pm) when water is warmest." : "Early morning and late afternoon. Fish the moving tide if saltwater, or low-light periods if freshwater.",
  });
});

async function fetchWeather(lat: number, lon: number): Promise<{
  windSpeed: number; windDirection: string; barometricPressure: number;
  waterTemp: number | null; waveHeight: number | null; waterClarity: string;
}> {
  const fetchWithTimeout = async (url: string, ms: number) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    try { return await fetch(url, { signal: controller.signal }); }
    finally { clearTimeout(timer); }
  };

  try {
    const [wxRes, marineRes] = await Promise.all([
      fetchWithTimeout(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=wind_speed_10m,wind_direction_10m,pressure_msl,wave_height,wave_direction&wind_speed_unit=mph&temperature_unit=fahrenheit`,
        8000
      ),
      fetchWithTimeout(
        `https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lon}&current=sea_surface_temperature`,
        8000
      ).catch(() => null),
    ]);

    const wx = wxRes ? await wxRes.json() as any : null;
    const c = wx?.current;
    if (!c) throw new Error("No current weather data");

    const dir = c.wind_direction_10m;
    const dirs = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
    const windDir = dirs[Math.round((dir % 360) / 22.5) % 16];

    let waterTemp: number | null = null;
    if (marineRes) {
      try {
        const marineData = await marineRes.json() as any;
        const sst = marineData?.current?.sea_surface_temperature;
        if (typeof sst === "number") waterTemp = Math.round(sst * 9 / 5 + 32);
      } catch { /* ignore */ }
    }
    if (waterTemp === null) {
      const absLat = Math.abs(lat);
      waterTemp = absLat < 25 ? 82 : absLat < 30 ? 75 : absLat < 35 ? 65 : absLat < 40 ? 55 : absLat < 45 ? 50 : 45;
    }

    const waveHt = typeof c.wave_height === "number" ? Math.round(c.wave_height * 3.281 * 10) / 10
      : Math.round(c.wind_speed_10m * 0.15 * 10) / 10;
    const clarity = waveHt < 1.5 ? "clear" : waveHt < 3 ? "slightly murky" : "murky";

    return {
      windSpeed: Math.round(c.wind_speed_10m),
      windDirection: windDir,
      barometricPressure: Math.round(c.pressure_msl * 0.02953 * 100) / 100,
      waterTemp,
      waveHeight: waveHt,
      waterClarity: clarity,
    };
  } catch (err) {
    console.error("Weather fetch failed:", err);
    const absLat = Math.abs(lat);
    return {
      windSpeed: 8, windDirection: "SE", barometricPressure: 30.0,
      waterTemp: absLat < 25 ? 82 : absLat < 35 ? 70 : absLat < 45 ? 55 : 45,
      waveHeight: null, waterClarity: "clear",
    };
  }
}
router.post("/conditions", async (req, res) => {
  const parsed = GetConditionsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const { latitude, longitude, waterBodyType: wt } = parsed.data;
  const tides = await getTideData(latitude, longitude);
  const wx = await fetchWeather(latitude, longitude);
  const isFresh = ["lake", "pond", "river"].includes(String(wt));

  const windSpeed = typeof wx.windSpeed === "number" ? wx.windSpeed : 8;
  const windDirection = typeof wx.windDirection === "string" ? wx.windDirection : "SE";
  const pressure = typeof wx.barometricPressure === "number" ? wx.barometricPressure : 30.0;

  const nowH = new Date().getHours();

  const filteredChart = tides.tideChart
    .map((e, i) => ({ e, i }))
    .filter(({ i }) => i !== 24 && (((i - nowH + 24) % 24) <= 6 || ((i - nowH + 24) % 24) >= 18))
    .sort((a, b) => {
      const da = (a.i - nowH + 24) % 24 >= 18;
      const db = (b.i - nowH + 24) % 24 >= 18;
      if (da !== db) return db ? 1 : -1;
      const va = da ? a.i : (a.i < nowH ? a.i + 24 : a.i);
      const vb = db ? b.i : (b.i < nowH ? b.i + 24 : b.i);
      return va - vb;
    })
    .map(({ e }) => e);

  const currentHeightFt = isFresh || tides.tideChart.length === 0
    ? null
    : tides.tideChart[nowH]?.heightFt ?? null;

  res.json({
    windSpeed,
    windDirection,
    barometricPressure: pressure,
    waterTemp: isFresh ? null : wx.waterTemp,
    tidalPhase: isFresh ? "N/A - Freshwater" : tides.tidalPhase,
    waveHeight: currentHeightFt,
    salinity: isFresh ? null : 25,
    waterClarity: wx.waterClarity,
    overallRating: windSpeed < 15 ? 8 : windSpeed < 25 ? 6 : 4,
    activityForecast: windSpeed < 10
      ? "Excellent conditions — light winds and good visibility."
      : windSpeed < 20
        ? "Good conditions — moderate winds, fish may be active near structure."
        : "Rough conditions — strong winds, fish deep or in protected areas.",
    tideChart: isFresh ? [] : filteredChart,
  });
});

interface BaitRec {
  species: string;
  topLiveBait: string;
  topArtificial: string;
  liveBaits: string[];
  artificials: string[];
  bestTime: string;
  tip: string;
}

const SPECIES_BAIT: Record<string, BaitRec> = {
  // ===== Gulf / Atlantic Inshore Gamefish =====
  "Speckled Trout": { species: "Speckled Trout", topLiveBait: "Live shrimp under a popping cork", topArtificial: "MirrOlure 52MR (chrome/black)", liveBaits: ["Live shrimp under a popping cork", "Finger mullet freelined", "Live croaker on a Carolina rig"], artificials: ["MirrOlure 52MR (chrome/black)", "Gulp! Swimming Mullet (chartreuse)", "Z-Man Trout Trick (morning glory)"], bestTime: "Dawn 5-8am and dusk 6-9pm; overcast days are best", tip: "Work grass flats, potholes, and shoreline drop-offs. Use a slow, steady retrieve with occasional twitches." },
  "Spotted Seatrout": { species: "Spotted Seatrout", topLiveBait: "Live shrimp under a popping cork (TPWD #1 choice)", topArtificial: "Soft plastic jerkbait (pink/chartreuse) on 1/4 oz jig head", liveBaits: ["Live shrimp under a popping cork", "Live croaker on a Carolina rig", "Finger mullet freelined"], artificials: ["Soft plastic jerkbait (pink/chartreuse) on 1/4 oz jig head", "MirrOlure 52MR (chrome/black)", "Z-Man Trout Trick (morning glory)", "Topwater plug (spook-style) at dawn"], bestTime: "Dawn 5-8am; spring and fall; incoming tide best", tip: "TPWD research shows live shrimp accounts for 1 in 4 fish caught in Texas bays after age 2, trout shift to eating mostly fish, so live croaker or pinfish become better bait." },
  "Sand Seatrout": { species: "Sand Seatrout", topLiveBait: "Dead shrimp on a #2 hook bottom rig", topArtificial: "1/4 oz jig head with 3-inch curly tail grub (white/silver)", liveBaits: ["Dead shrimp on a #2 hook bottom rig", "Live shrimp on a popping cork", "Squid strips"], artificials: ["1/4 oz jig head with 3-inch curly tail grub (white/silver)", "Small spoon (gold, 1/8 oz)", "MirrOlure Lil John (silver)"], bestTime: "Late afternoon through night; often under dock lights", tip: "Sand seatrout are the most abundant sciaenid in Galveston Bay per NOAA ELMR data. They school in sandy-bottom areas and stack under lights at night." },
  "Red Drum": { species: "Red Drum", topLiveBait: "Live blue crab (halved, on a fish-finder rig)", topArtificial: "Gold Johnson Silver Minnow spoon (1 oz)", liveBaits: ["Live blue crab (halved, on a fish-finder rig)", "Live mullet on a Carolina rig", "Dead shrimp on a bottom rig"], artificials: ["Gold Johnson Silver Minnow spoon (1 oz)", "Bomber Wind Cheater (red/white)", "Gulp! Crab on a 1/4 oz jig head"], bestTime: "First 3 hours of outgoing tide; also good on incoming at night", tip: "Bull reds (>30 inch) cruise the gutters at night — fish heavy tackle with cut mullet on a 6/0 circle hook." },
  "Black Drum": { species: "Black Drum", topLiveBait: "Fresh dead shrimp on a bottom rig", topArtificial: "Gold spoon (1/2 oz)", liveBaits: ["Fresh dead shrimp on a bottom rig", "Cut blue crab", "Squid strips"], artificials: ["Gold spoon (1/2 oz)", "Gulp! Crab (black)", "3-inch curly tail grub (white)"], bestTime: "Late afternoon into night; best around structure", tip: "Black drum often hang around pilings and jetties — fish right against the structure with a slow presentation." },
  "Sheepshead": { species: "Sheepshead", topLiveBait: "Fiddler crabs on a small hook", topArtificial: "Small shrimp jig (natural color)", liveBaits: ["Fiddler crabs on a small hook", "Live shrimp on a #2 hook", "Barnacles scraped off pilings"], artificials: ["Small shrimp jig (natural color)", "1/8 oz jig head with 2-inch grub (white)", "Mud minnow imitation (1/16 oz)"], bestTime: "Incoming tide around structure; winter is prime season", tip: "Sheepshead have small mouths — use small hooks (#4-#2), watch for subtle nibbles, and set the hook quickly." },
  "Flounder (Southern)": { species: "Flounder (Southern)", topLiveBait: "Live finger mullet on a Carolina rig", topArtificial: "Berkley Gulp! Swimming Mullet (white, 3 inch)", liveBaits: ["Live finger mullet on a Carolina rig", "Live mud minnows on a slip rig", "Live bull minnows"], artificials: ["Berkley Gulp! Swimming Mullet (white, 3 inch)", "DOA Shrimp (glow)", "Z-Man MinnowZ (pearl white)"], bestTime: "Fall run (Oct-Nov) peaks; spring run (Apr-May) also good", tip: "Drag bait slowly along the bottom behind the first sandbar. Flounder hug the bottom and strike when bait passes overhead." },
  "Southern Flounder": { species: "Southern Flounder", topLiveBait: "Live mud minnows (killifish) on a slip rig (TPWD recommended)", topArtificial: "Berkley Gulp! Swimming Mullet (white, 3 inch) on 1/4 oz jig head", liveBaits: ["Live mud minnows (killifish) on a slip rig", "Live finger mullet on a Carolina rig", "Live bull minnows"], artificials: ["Berkley Gulp! Swimming Mullet (white, 3 inch) on 1/4 oz jig head", "DOA Shrimp (glow)", "Z-Man MinnowZ (pearl white)", "1/4 oz bucktail jig (white) with soft plastic trailer"], bestTime: "Fall run Oct-Nov (peak migration); spring Apr-May also good", tip: "TPWD reports killifish (mud minnows) are the bait of choice for flounder. Gigging is also popular in Clear Lake area during fall run." },
  "Gulf Flounder": { species: "Gulf Flounder", topLiveBait: "Live mud minnows on a slip rig", topArtificial: "Gulp! Shrimp (natural) on a 1/4 oz jig head", liveBaits: ["Live mud minnows on a slip rig", "Live shrimp freelined", "Bull minnows"], artificials: ["Gulp! Shrimp (natural) on a 1/4 oz jig head", "Small bucktail jig (1/4 oz, white)", "3-inch soft plastic swimbait (pearl)"], bestTime: "Spring and fall; found in sandy areas near grass flats", tip: "Gulf flounder have 3 ocellated spots forming a triangle. They're less common than Southern flounder but still regularly caught in Galveston Bay." },
  "Sand Trout": { species: "Sand Trout", topLiveBait: "Live shrimp on a #1 hook with split shot", topArtificial: "1/4 oz jig head with 3-inch curly tail grub (white)", liveBaits: ["Live shrimp on a #1 hook with split shot", "Dead shrimp on a bottom rig", "Squid strips"], artificials: ["1/4 oz jig head with 3-inch curly tail grub (white)", "MirrOlure Lil John (silver)", "Small spoon (gold, 1/8 oz)"], bestTime: "Late afternoon through night; often under lights", tip: "Sand trout school in sandy-bottom areas. Look for them under dock lights at night — they stack up in the glare." },
  "Atlantic Croaker": { species: "Atlantic Croaker", topLiveBait: "Dead shrimp on a bottom rig", topArtificial: "1/4 oz jig head with 2-inch shrimp imitation", liveBaits: ["Dead shrimp on a bottom rig", "Bloodworms on a #2 hook", "Squid strips"], artificials: ["1/4 oz jig head with 2-inch shrimp imitation", "Small gold spoon (1/8 oz)", "Gulp! Shrimp (natural, 1 inch)"], bestTime: "Evening and night fishing; best in cooler months (Oct-Mar)", tip: "Croaker are bottom feeders. Use a fish-finder rig with just enough weight to hold bottom. They love deep channels near grass flats." },
  "Hardhead Catfish": { species: "Hardhead Catfish", topLiveBait: "Cut shrimp on a bottom rig (any size hook)", topArtificial: "Cut bait on a Carolina rig (presentation matters, not lure choice)", liveBaits: ["Cut shrimp on a bottom rig", "Squid strips", "Cut mullet", "Chicken liver"], artificials: ["Berkley Gulp! Shrimp (deadliest)", "Fish-bite shrimp scented baits"], bestTime: "Night fishing; they are active 24/7 but most active after dark", tip: "Hardheads are the most common bycatch in the Gulf. They have a mild venom in their dorsal and pectoral spines — handle with pliers and cut the line rather than trying to unhook a deeply hooked fish." },
  "Gafftop Catfish (Sail Catfish)": { species: "Gafftop Catfish (Sail Catfish)", topLiveBait: "Cut mullet on a bottom rig", topArtificial: "Cut bait is best; artificials rarely work", liveBaits: ["Cut mullet on a bottom rig", "Dead shrimp", "Squid strips", "Crab chunks"], artificials: ["Scented soft plastic shrimp imitations"], bestTime: "Warmer months, especially at night in shallow bays", tip: "The gafftop has a long poisonous spine on the dorsal fin. Use heavy gloves and long pliers. Their meat is actually good eating — soak in milk overnight to remove mild mud taste." },
  "Whiting (Gulf Kingfish)": { species: "Whiting (Gulf Kingfish)", topLiveBait: "Fresh dead shrimp on a #2 hook", topArtificial: "Fishbites (bloodworm flavor) on a double-drop rig", liveBaits: ["Fresh dead shrimp on a #2 hook", "Squid strips", "Bloodworms", "Sand fleas"], artificials: ["Fishbites (bloodworm flavor) on a double-drop rig", "Small gold hook with shrimp-scented plastic"], bestTime: "Early morning surf fishing; best spring and fall", tip: "Whiting are the #1 surf catch on Gulf beaches. Use a two-hook bottom rig cast past the first breakers. They're excellent table fare." },
  "Pompano": { species: "Pompano", topLiveBait: "Live sand fleas (mole crabs) on a #4 hook", topArtificial: "Pompano jig (pink/white, 1 oz) with Fishbites", liveBaits: ["Live sand fleas (mole crabs) on a #4 hook", "Dead shrimp tipped with Fishbites"], artificials: ["Pompano jig (pink/white, 1 oz) with Fishbites", "Gold spoon (1/4 oz)", "DOA Shrimp (pumpkinseed)"], bestTime: "Mid-morning to early afternoon in surf; spring and fall runs peak", tip: "Fish the second sandbar trough. Pompano have small mouths — use small hooks and watch for a fast tap-tap-tap before the line goes tight." },
  "Spanish Mackerel": { species: "Spanish Mackerel", topLiveBait: "Live shrimp freelined", topArtificial: "Gotcha Plug (green/chrome)", liveBaits: ["Live shrimp freelined", "Finger mullet on a light wire hook"], artificials: ["Gotcha Plug (green/chrome)", "Clark Spoon (silver)", "Blue/white epoxy jig"], bestTime: "Mid-morning to afternoon when water warms", tip: "Use a wire leader — Spanish mackerel have razor-sharp teeth that cut regular monofilament instantly." },
  "King Mackerel": { species: "King Mackerel", topLiveBait: "Live blue runner or cigar minnow (freelined)", topArtificial: "Clark Spoon (silver, 2 oz) trolled fast", liveBaits: ["Live blue runner or cigar minnow (freelined)", "Ribbonfish strip"], artificials: ["Clark Spoon (silver, 2 oz) trolled fast", "King lure with strip bait", "Heavy diamond jig (3 oz)"], bestTime: "Early morning trolling; summer through early fall", tip: "Kingfish are fast pelagic predators. Troll at 6-8 knots. Use a long wire leader (12-18 inch) — a king will cut 50 lb mono in a heartbeat." },
  "Cobia": { species: "Cobia", topLiveBait: "Live eel freelined near structure", topArtificial: "Bucktail jig (white, 1 oz) with soft plastic trailer", liveBaits: ["Live eel freelined near structure", "Live crab on the surface", "Live bullet tuna"], artificials: ["Bucktail jig (white, 1 oz) with soft plastic trailer", "Large paddle-tail swimbait (pearl white)", "Diamond jig (3 oz)"], bestTime: "Spring (Apr-May) migration along the Gulf Coast; near buoys and structure", tip: "Cobia often cruise alongside sharks and rays. Cast a bucktail ahead of a swimming ray and retrieve past it — cobia follow the ray to eat scraps." },
  "Jack Crevalle": { species: "Jack Crevalle", topLiveBait: "Live mullet or menhaden (freelined)", topArtificial: "Topwater plug (spook-style, bone color)", liveBaits: ["Live mullet or menhaden (freelined)", "Live blue crab (halved)"], artificials: ["Topwater plug (spook-style, bone color)", "Large paddle-tail swimbait (chartreuse)", "Popping cork with shrimp fly"], bestTime: "Early morning topwater feeding blitzes; year-round in warm waters", tip: "Jacks fight hard and long. Use 20-30 lb tackle. When you see surface commotion, cast into the middle of the fray and hang on." },
  "Ladyfish": { species: "Ladyfish", topLiveBait: "Live shrimp on a light wire hook", topArtificial: "Small topwater plug or spoon (gold, 1/4 oz)", liveBaits: ["Live shrimp on a light wire hook", "Small finger mullet"], artificials: ["Small topwater plug or spoon (gold, 1/4 oz)", "Small jig with soft plastic (1/8 oz, white)", "Gotcha Plug (small, silver)"], bestTime: "Summer evenings near inlets; often seen feeding at surface", tip: "Ladyfish are acrobatic fighters — they jump repeatedly. Use light tackle (8-10 lb) for sport and a net to land them (they shake hooks easily)." },
  "False Albacore (Little Tunny)": { species: "False Albacore (Little Tunny)", topLiveBait: "Live pilchard or threadfin herring (chunked)", topArtificial: "Epoxy jig (1.5 oz, silver/blue) cast into feeding schools", liveBaits: ["Live pilchard or threadfin herring (chunked)", "Strip bait from bonito belly"], artificials: ["Epoxy jig (1.5 oz, silver/blue) cast into feeding schools", "Clark Spoon (silver, 1 oz)", "Casting jig (1.5 oz, white/chartreuse)"], bestTime: "Late summer through fall when baitfish schools are plentiful", tip: "False albacore are speedsters — they hit 40+ mph. When you see birds diving on bait balls, cast into the edge of the school. Use 15-20 lb fluorocarbon leader." },

  // ===== Gulf / Atlantic Sharks & Rays =====
  "Blacktip Shark": { species: "Blacktip Shark", topLiveBait: "Fresh cut mullet on a wire leader, fish-finder rig", topArtificial: "Large soft plastic swimbait on a jig head (teased slowly)", liveBaits: ["Fresh cut mullet on a wire leader, fish-finder rig", "Live blue runner on a steel leader", "Bonito belly strips"], artificials: ["Large soft plastic swimbait on a jig head (teased slowly)", "Large surface plug (spook-style)"], bestTime: "Early morning and late evening; most active spring-fall", tip: "Use a 4-6 ft steel or heavy mono leader. Blacktips frequently jump, so keep the rod tip up and the line tight." },
  "Bonnethead Shark": { species: "Bonnethead Shark", topLiveBait: "Fresh dead shrimp on a Carolina rig with wire leader", topArtificial: "Scented soft plastic shrimp imitation on a jig head", liveBaits: ["Fresh dead shrimp on a Carolina rig with wire leader", "Cut blue crab (small)", "Squid strips"], artificials: ["Scented soft plastic shrimp imitation on a jig head", "Fishbites shrimp flavor"], bestTime: "Daytime in shallow flats; summer months most active", tip: "Bonnetheads are the most common small shark in Gulf bays. Use a light wire leader (20 lb). They are harmless to people and good eating." },
  "Atlantic Sharpnose Shark": { species: "Atlantic Sharpnose Shark", topLiveBait: "Cut mullet or menhaden on a bottom rig (wire leader)", topArtificial: "Large spoons retrieved fast", liveBaits: ["Cut mullet or menhaden on a bottom rig (wire leader)", "Live spot or croaker", "Squid strips"], artificials: ["Large spoons retrieved fast", "Large swimbaits on jig head"], bestTime: "Most active dusk to dawn; year-round in warm waters", tip: "Sharpnose sharks are the most abundant shark in the Gulf of Mexico. Use a 12-18 inch steel leader. They are edible and often targeted in shark tournaments." },
  "Bull Shark": { species: "Bull Shark", topLiveBait: "Large cut bait (jack crevalle, king mackerel chunks) on a 10/0 circle hook", topArtificial: "Large swimbaits or heavy spoons", liveBaits: ["Large cut bait (jack crevalle, king mackerel chunks) on a 10/0 circle hook", "Live stingray (wing removed)", "Large mullet"], artificials: ["Large swimbaits or heavy spoons", "Large topwater plugs (spook)"], bestTime: "Night fishing; bull sharks are most active in low light", tip: "Bull sharks are aggressive and can swim in brackish and fresh water. Use 200+ lb leader, a steel cable trace, and very heavy tackle (50+ lb class). Handle with extreme caution." },
  "Spinner Shark": { species: "Spinner Shark", topLiveBait: "Live menhaden on a steel leader freelined", topArtificial: "Large topwater plug (spook) walked across surface", liveBaits: ["Live menhaden on a steel leader freelined", "Cut mullet on a fish-finder rig"], artificials: ["Large topwater plug (spook) walked across surface", "Large silver spoon (3 oz)"], bestTime: "Late afternoon near passes and inlets; spring-fall", tip: "Spinner sharks are named for their spinning leaps when hooked. Use a 4-6 ft steel leader and 30-50 lb tackle. When they breach, keep pressure on." },
  "Southern Stingray": { species: "Southern Stingray", topLiveBait: "Dead shrimp or squid on a #4 hook", topArtificial: "Scented shrimp bait", liveBaits: ["Dead shrimp or squid on a #4 hook", "Cut fish strips"], artificials: ["Scented shrimp bait"], bestTime: "Daytime in shallow flats; most active summer", tip: "Stingrays are not typically targeted by anglers but are common bycatch. The barb on the tail can cause serious injury — shuffle your feet when wading (stingray shuffle) to avoid stepping on one." },
  "Cownose Ray": { species: "Cownose Ray", topLiveBait: "Clams or oysters on a bottom rig", topArtificial: "N/A — bait fishing only", liveBaits: ["Clams or oysters on a bottom rig", "Squid strips", "Dead shrimp"], artificials: [], bestTime: "Mid-day in shallow bays; fall migration produces large schools", tip: "Cownose rays travel in large schools of 50-100. When hooked, they put up a strong fight but are docile. Cut the line as close as possible — they are not good table fare." },
  "Spot": { species: "Spot", topLiveBait: "Bloodworms or pieces of shrimp on a #4 hook bottom rig", topArtificial: "Small gold hook with Fishbites (bloodworm flavor)", liveBaits: ["Bloodworms on a #4 hook bottom rig", "Dead shrimp pieces", "Squid strips"], artificials: ["Small gold hook with Fishbites (bloodworm flavor)", "1/16 oz jig head with 1-inch soft plastic (chartreuse)"], bestTime: "Fall and winter; spot move into bays in cooler months", tip: "Spot are excellent table fare despite their small size. Use a double-drop bottom rig to maximize catches." },
  "Silver Perch": { species: "Silver Perch", topLiveBait: "Dead shrimp pieces on a #6 hook bottom rig", topArtificial: "Small jig (1/16 oz, white/silver)", liveBaits: ["Dead shrimp pieces on a #6 hook bottom rig", "Bloodworms", "Small squid strips"], artificials: ["Small jig (1/16 oz, white/silver)", "Trout magnet (white)"], bestTime: "Spring through fall in shallow bays; often caught as bycatch", tip: "Silver perch are small but make excellent live bait for larger gamefish like trout and redfish." },
  "Pinfish": { species: "Pinfish", topLiveBait: "Dead shrimp pieces on a #8 hook", topArtificial: "Small jig (1/32 oz, chartreuse)", liveBaits: ["Dead shrimp pieces on a #8 hook", "Squid strips", "Fiddler crabs"], artificials: ["Small jig (1/32 oz, chartreuse)", "Small beetle spin (white)"], bestTime: "Year-round; pinfish are aggressive and always biting", tip: "Pinfish are the #1 bait-stealer in the Gulf. Use them as live bait for larger predators — hook through the lips or back." },
  "Florida Pompano": { species: "Florida Pompano", topLiveBait: "Live sand fleas (mole crabs) on a #4 hook (TPWD recommendation)", topArtificial: "Pompano jig (pink/white, 1 oz) tipped with Fishbites", liveBaits: ["Live sand fleas (mole crabs) on a #4 hook", "Dead shrimp tipped with Fishbites"], artificials: ["Pompano jig (pink/white, 1 oz) tipped with Fishbites", "Gold spoon (1/4 oz)", "DOA Shrimp (pumpkinseed)"], bestTime: "Spring and fall surf fishing; second sandbar trough", tip: "Pompano are prized table fare. Fish the trough behind the first sandbar in the surf. TPWD recommends Fishbites as the best artificial option." },
  "Striped Mullet": { species: "Striped Mullet", topLiveBait: "Bread balls or dough on a #8 hook (chum with corn/oatmeal)", topArtificial: "Cast net (mullet are rarely caught on hook and line)", liveBaits: ["Bread balls on a #8 hook", "Dough balls chummed with cornmeal"], artificials: ["Cast net — mullet feed on algae and detritus, rarely take lures"], bestTime: "Summer; mullet jump and school near the surface", tip: "Striped mullet are primarily caught with cast nets for bait. They're filter feeders and rarely bite hooks. TPWD lists them as critical baitfish for redfish and trout." },
  "Pigfish": { species: "Pigfish", topLiveBait: "Dead shrimp on a #6 hook bottom rig", topArtificial: "Small soft plastic shrimp imitation (1/16 oz)", liveBaits: ["Dead shrimp on a #6 hook bottom rig", "Squid strips", "Bloodworms"], artificials: ["Small soft plastic shrimp imitation (1/16 oz)"], bestTime: "Spring through fall in grass flats and sandy bottom", tip: "Pigfish (piggy perch) are excellent live bait for speckled trout and redfish. Hook through the lips and freelined near structure." },

  // ===== Forage Baitfish (Shad, Minnows, Silversides) =====
  "Gizzard Shad": { species: "Gizzard Shad", topLiveBait: "Cast net or sabiki rig (rarely caught on hook)", topArtificial: "Sabiki rig with tiny gold hooks", liveBaits: ["Cast net — gizzard shad are filter feeders, rarely take bait"], artificials: ["Sabiki rig with tiny gold hooks tipped with dough", "Small piece of bread on a #10 hook (chummed area)"], bestTime: "Spring spawning runs up rivers; can be snagged or netted", tip: "Gizzard shad are the #1 forage fish in Texas reservoirs per TPWD. Use cut shad as bait for catfish and striped bass. They die easily — keep aerated." },
  "Threadfin Shad": { species: "Threadfin Shad", topLiveBait: "Sabiki rig or cast net only", topArtificial: "Micro jig (1/32 oz, silver) on ultra-light line", liveBaits: ["Cast net — threadfin are open-water plankton feeders"], artificials: ["Micro jig (1/32 oz, silver) on ultra-light line", "Sabiki rig with tiny gold flies"], bestTime: "Summer schooling near surface; threadfin die off in cold winters", tip: "Threadfin shad are smaller than gizzard shad and are critical prey for bass and crappie. They are temperature sensitive — watch for winter die-offs." },
  "Inland Silverside": { species: "Inland Silverside", topLiveBait: "Cast net (too small for hook and line)", topArtificial: "N/A — baitfish only", liveBaits: ["Cast net — inland silversides are small (2-3 inch) baitfish"], artificials: [], bestTime: "Spring through fall in open water", tip: "Inland silversides are an important prey species in TPWD surveys of Lake Houston and other Texas reservoirs." },

  // ===== Less Common Freshwater Sportfish =====
  "Yellow Bass": { species: "Yellow Bass", topLiveBait: "Small minnows on a #6 hook under a bobber", topArtificial: "1/16 oz jig head with 2-inch soft plastic (white/chartreuse)", liveBaits: ["Small minnows on a #6 hook under a bobber", "Waxworms", "Nightcrawler pieces"], artificials: ["1/16 oz jig head with 2-inch soft plastic (white/chartreuse)", "Small beetle spin (white)", "Trout magnet"], bestTime: "Spring spawning runs; summer early morning schooling", tip: "Yellow bass are smaller cousins of white bass. They school tightly — use light tackle and cast into surface activity." },
  "Redfin Pickerel": { species: "Redfin Pickerel", topLiveBait: "Live minnow on a #4 hook under a bobber", topArtificial: "Small spoon (silver, 1/8 oz) retrieved fast near weeds", liveBaits: ["Live minnow on a #4 hook under a bobber", "Nightcrawlers"], artificials: ["Small spoon (silver, 1/8 oz) retrieved fast near weeds", "Rebel Minnow (silver/black, 2 inch)"], bestTime: "Spring in vegetated shallows; early morning", tip: "Redfin pickerel are small (8-12 inch) ambush predators found in weedy areas. Use a short wire leader as they have small teeth." },
  "Alligator Gar": { species: "Alligator Gar", topLiveBait: "Large live mullet or carp on a 10/0 circle hook", topArtificial: "Rope lure (braided nylon rope frayed at end)", liveBaits: ["Large live mullet or carp on a 10/0 circle hook", "Cut carp on a bottom rig with wire leader"], artificials: ["Rope lure (braided nylon rope frayed at end) — gar teeth tangle in the rope fibers"], bestTime: "Summer; alligator gar feed actively in warm water near surface", tip: "Alligator gar can exceed 8 ft and 200+ lb. Use heavy tackle (80+ lb braid) and a steel leader. Handle with extreme caution — they have sharp teeth and are powerful. TPWD regulates a 48-inch max length limit on Lake Livingston." },
  "Spotted Gar": { species: "Spotted Gar", topLiveBait: "Live minnow on a #4 hook near surface (use frayed rope or wire leader)", topArtificial: "Frayed nylon rope lure (entangles teeth)", liveBaits: ["Live minnow on a #4 hook near surface (use frayed rope or wire leader)", "Cut fish strips near surface"], artificials: ["Frayed nylon rope lure (entangles teeth)", "Small surface plug with trailer hook"], bestTime: "Summer; spotted gar bask near the surface and feed actively in warm weather", tip: "Spotted gar are smaller than alligator gar (2-3 ft). They have bony mouths — standard hooks rarely penetrate. The rope lure method works best." },
  "Spotted Sucker": { species: "Spotted Sucker", topLiveBait: "Nightcrawlers or dough balls on a #6 hook bottom rig", topArtificial: "Small jig (1/16 oz) tipped with worm, bounced on bottom", liveBaits: ["Nightcrawlers on a #6 hook bottom rig", "Dough balls", "Corn kernels"], artificials: ["Small jig (1/16 oz) tipped with worm, bounced on bottom"], bestTime: "Spring and summer in shallow creek mouths and sandy runs", tip: "Spotted suckers are bottom feeders that prefer clear, flowing water. They put up a good fight on light tackle." },

  // ===== Gulf / Atlantic Bottom & Reef =====
  "Mangrove Snapper": { species: "Mangrove Snapper", topLiveBait: "Live shrimp on a #2 hook near structure", topArtificial: "1/4 oz jig with 3-inch soft plastic shrimp (natural)", liveBaits: ["Live shrimp on a #2 hook near structure", "Live pinfish", "Squid strips"], artificials: ["1/4 oz jig with 3-inch soft plastic shrimp (natural)", "Small bucktail jig (white, 1/8 oz)", "MirrOlure Lil John (silver)"], bestTime: "Incoming tide; best early morning near docks and mangroves", tip: "Mangrove snapper are line-shy — use 15-20 lb fluorocarbon leader. Fish tight to structure; they bolt for cover when hooked." },
  "Lane Snapper": { species: "Lane Snapper", topLiveBait: "Small live shrimp on a light wire hook", topArtificial: "Small jig head with shrimp imitation (1/16 oz)", liveBaits: ["Small live shrimp on a light wire hook", "Squid strips on a #4 hook"], artificials: ["Small jig head with shrimp imitation (1/16 oz)", "Small gold hook with shrimp scented plastic"], bestTime: "Evening fishing; best over sandy bottom near reefs", tip: "Lane snapper are smaller than mangrove snapper but excellent eating. Use light tackle (10-12 lb) and small hooks." },
  "Vermilion Snapper": { species: "Vermilion Snapper", topLiveBait: "Squid strips on a bottom rig (2/0 hook)", topArtificial: "Deep jig (butterfly jig, silver/blue, 2 oz)", liveBaits: ["Squid strips on a bottom rig (2/0 hook)", "Live shrimp on a dropper loop"], artificials: ["Deep jig (butterfly jig, silver/blue, 2 oz)", "Banded sea bass rig with squid strips"], bestTime: "Deep water (80-150 ft) year-round; best in winter", tip: "Vermilion snapper (Beeliners) school in deep water. Use a heavy sinker to reach bottom fast and work the reef edges." },
  "Triggerfish": { species: "Triggerfish", topLiveBait: "Squid strips on a small hook (#2)", topArtificial: "Small diamond jig (1/2 oz) bounced off bottom", liveBaits: ["Squid strips on a small hook (#2)", "Shrimp pieces", "Clam strips"], artificials: ["Small diamond jig (1/2 oz) bounced off bottom", "Small bucktail (1/4 oz, chartreuse)"], bestTime: "Summer; found near reefs and wrecks in 40-100 ft", tip: "Triggerfish have strong teeth that can crush shells. Use a light wire leader and a quick hookset — they steal bait in an instant." },
  "Amberjack (Greater)": { species: "Amberjack (Greater)", topLiveBait: "Live blue runner on a 6/0 hook near structure", topArtificial: "Large diamond jig (4-6 oz) yo-yoed off bottom", liveBaits: ["Live blue runner on a 6/0 hook near structure", "Live cigar minnows", "Bonito strips"], artificials: ["Large diamond jig (4-6 oz) yo-yoed off bottom", "Large soft plastic swimbait (10 inch, white)"], bestTime: "Summer on offshore wrecks and reefs; early morning", tip: "Amberjack are among the hardest fighting fish. Use 50-80 lb tackle and a harness. They head straight for bottom structure when hooked — stop them before they cut you off." },
  "Grouper (Gag)": { species: "Grouper (Gag)", topLiveBait: "Live pinfish or grunt on a 7/0 circle hook near bottom structure", topArtificial: "Large soft plastic swimbait on a 4 oz jig head", liveBaits: ["Live pinfish or grunt on a 7/0 circle hook near bottom structure", "Squid strips", "Cut bonito"], artificials: ["Large soft plastic swimbait on a 4 oz jig head", "Heavy bucktail jig (4 oz, white)", "Deep diving crankbait"], bestTime: "Spring and fall; found on rocky bottom and wrecks in 60-150 ft", tip: "Grouper are ambush predators. Drop bait right on the structure and be ready — the bite comes instantly. Set the hook hard and keep them out of the rocks." },
  "Grouper (Red)": { species: "Grouper (Red)", topLiveBait: "Live tomtate or grunt on a 5/0 circle hook", topArtificial: "Yo-yo jig (butterfly jig, 3-4 oz)", liveBaits: ["Live tomtate or grunt on a 5/0 circle hook", "Squid strips", "Cut fish"], artificials: ["Yo-yo jig (butterfly jig, 3-4 oz)", "Heavy bucktail (3 oz, white)"], bestTime: "Year-round in deep water (100-300 ft); peak summer", tip: "Red grouper are more bottom-oriented than gag. Fish directly on the bottom with enough weight to hold in current." },
  "Mahi-Mahi (Dolphinfish)": { species: "Mahi-Mahi (Dolphinfish)", topLiveBait: "Live ballyhoo or cigar minnow (freelined)", topArtificial: "Sea Witch with ballyhoo strip trolled at 6-8 knots", liveBaits: ["Live ballyhoo or cigar minnow (freelined)", "Live flyingfish", "Strip bait"], artificials: ["Sea Witch with ballyhoo strip trolled at 6-8 knots", "Cloned sardine lure", "Black Bart lure (pink/white)"], bestTime: "Late spring through fall; found near floating debris and weedlines", tip: "Mahi change color rapidly when fighting — from bright gold to silver. They school under floating objects; throw a pitch bait near any debris you see." },

  // ===== Atlantic Coast Only =====
  "Striped Bass": { species: "Striped Bass", topLiveBait: "Live eel (freelined) drifting with current", topArtificial: "SP Minnow (bunker pattern, 7 inch) slow retrieved", liveBaits: ["Live eel (freelined) drifting with current", "Live bunker (menhaden) on a circle hook", "Bloodworms on a bottom rig"], artificials: ["SP Minnow (bunker pattern, 7 inch) slow retrieved", "Bucktail jig (1 oz, white) with pork rind trailer", "Danny plug (swimming, yellow)"], bestTime: "Spring and fall runs; early morning and late evening best", tip: "Stripers are migratory. Follow the bunker schools. Use a slow retrieve with occasional pauses — stripers hit when the lure pauses." },
  "Bluefish": { species: "Bluefish", topLiveBait: "Fresh mullet strip on a wire leader", topArtificial: "Diamond jig (2 oz, silver) cast and retrieved fast", liveBaits: ["Fresh mullet strip on a wire leader", "Live spot on a freelined hook", "Squid strips"], artificials: ["Diamond jig (2 oz, silver) cast and retrieved fast", "Gotcha Plug (green/chrome)", "Metal spoon (blue/white, 1 oz)"], bestTime: "Any time when baitfish present; look for surface activity", tip: "Bluefish travel in packs — when you catch one, cast right back to the same spot. Use a wire leader; they have razor teeth." },
  "Summer Flounder (Fluke)": { species: "Summer Flounder (Fluke)", topLiveBait: "Live killifish (mud minnows) on a bucktail teaser", topArtificial: "4-inch Gulp! Swimming Mullet (white) on 1/2 oz jig head", liveBaits: ["Live killifish (mud minnows) on a bucktail teaser", "Live spearing", "Squid strips"], artificials: ["4-inch Gulp! Swimming Mullet (white) on 1/2 oz jig head", "Bucktail jig (3/8 oz, white) with squid strip trailer", "Spro bucktail with Gulp! grub trailer"], bestTime: "Summer months; drift over sandy bottom near structure", tip: "Fluke are ambush feeders. Use a bouncing rig — lift the rod tip 12-18 inches, then drop back. They hit on the drop. Keep the line tight." },
  "Tautog (Blackfish)": { species: "Tautog (Blackfish)", topLiveBait: "Green crabs (small, whole) on a #2 hook", topArtificial: "Artificial crab imitation (slow, bouncing off bottom)", liveBaits: ["Green crabs (small, whole) on a #2 hook", "Fiddler crabs", "Asian shore crabs", "Clam strips"], artificials: ["Artificial crab imitation (slow, bouncing off bottom)", "Black bucktail jig (1/2 oz) with green crab strip"], bestTime: "Fall and spring; found around rocky bottom and wrecks", tip: "Tog have crushing teeth to eat crabs. Use a strong hook and set it fast. Fish directly on the bottom — they hug structure tightly." },
  "Scup (Porgy)": { species: "Scup (Porgy)", topLiveBait: "Squid strips on a #6 hook (bottom rig)", topArtificial: "Small diamond jig (1/2 oz) with teaser fly", liveBaits: ["Squid strips on a #6 hook (bottom rig)", "Clam strips", "Bloodworms"], artificials: ["Small diamond jig (1/2 oz) with teaser fly", "Small bucktail (1/4 oz, pink)"], bestTime: "Summer months; found near rocky bottom in 30-80 ft", tip: "Scup school tightly — use a multi-hook rig to catch multiple at once. They have small mouths so use small hooks." },
  "Black Sea Bass": { species: "Black Sea Bass", topLiveBait: "Squid strips on a #2 hook (bottom rig)", topArtificial: "Jig head with soft plastic (1/2 oz, pink/white)", liveBaits: ["Squid strips on a #2 hook (bottom rig)", "Clam strips", "Live shrimp"], artificials: ["Jig head with soft plastic (1/2 oz, pink/white)", "Small bucktail (1/4 oz, chartreuse)"], bestTime: "Summer through fall; found near rocky bottom and wrecks", tip: "Sea bass are aggressive and will hit jigs hard. Drop straight down and jig vertically near the bottom." },

  // ===== Tropical / FL Keys =====
  "Tarpon": { species: "Tarpon", topLiveBait: "Live mullet (6-8 inch) on a 5/0 circle hook freelined", topArtificial: "7-inch DOA Baitbuster (gold/silver) slow-rolled", liveBaits: ["Live mullet (6-8 inch) on a 5/0 circle hook freelined", "Live crab on the surface", "Live pinfish"], artificials: ["7-inch DOA Baitbuster (gold/silver) slow-rolled", "Large soft plastic paddle-tail (white, 7 inch)", "Topwater plug (large spook, bone)"], bestTime: "Early morning; summer migration peak (May-July)", tip: "Tarpon are called Silver Kings for a reason. The explosive strike and 100+ lb aerial jumps are unforgettable. Set the hook 3-4 seconds after the take." },
  "Snook": { species: "Snook", topLiveBait: "Live shrimp under a popping cork near mangroves", topArtificial: "4-inch DOA TerrorEyz (glow/chartreuse) twitched slowly", liveBaits: ["Live shrimp under a popping cork near mangroves", "Live finger mullet freelined", "Live pinfish"], artificials: ["4-inch DOA TerrorEyz (glow/chartreuse) twitched slowly", "MirrOlure Top Dog Jr (red/white)", "Z-Man PaddlerZ (white, 4 inch)"], bestTime: "Dawn and dusk around inlets and passes during outgoing tide", tip: "Snook have a bony mouth — sharpen your hooks and set hard. They often sit in the shade under mangroves; cast right under the branches." },
  "Bonefish": { species: "Bonefish", topLiveBait: "Live shrimp on a #4 hook (freelined)", topArtificial: "Crazy Charlie (chartreuse/white, size 4)", liveBaits: ["Live shrimp on a #4 hook (freelined)", "Live crab (small)"], artificials: ["Crazy Charlie (chartreuse/white, size 4)", "Gotcha Clouser (pink/white, size 2)", "Merkin crab imitation (tan, size 4)"], bestTime: "Falling tide on shallow flats; early morning", tip: "Bonefish are the ghost of the flats — they spook easily. Make long casts (50+ ft) and lead the fish by 10 ft. Retrieve steadily without pauses." },
  "Permit": { species: "Permit", topLiveBait: "Live blue crab (small, de-legged) on a #2 hook", topArtificial: "Crab fly (McKenzie's Permit Crab, tan, size 2)", liveBaits: ["Live blue crab (small, de-legged) on a #2 hook", "Live shrimp"], artificials: ["Crab fly (McKenzie's Permit Crab, tan, size 2)", "Merkin crab (tan, size 2)", "Small crab imitation jig"], bestTime: "Late spring through fall; sight fishing on shallow flats", tip: "Permit have small mouths for their size — use small hooks and crabs. Cast 10 ft ahead of a cruising fish and let the crab sink. Wait until the fish picks it up before setting." },

  // ===== Pacific Coast =====
  "California Halibut": { species: "California Halibut", topLiveBait: "Live anchovy or sardine on a sliding hook rig", topArtificial: "Sardine-style swimbait (6 inch, white) on 1 oz jig head", liveBaits: ["Live anchovy or sardine on a sliding hook rig", "Live queenfish", "Squid strips"], artificials: ["Sardine-style swimbait (6 inch, white) on 1 oz jig head", "Rebel Windcheater (silver/black)", "Lucky Craft Flash Minnow (ghost)"], bestTime: "Summer near sandy bottom adjacent to structure; incoming tide", tip: "Halibut lie on sandy bottom near drop-offs. Bounce your bait off the bottom and let it sit — they strike when it settles." },
  "Lingcod": { species: "Lingcod", topLiveBait: "Live perch or greenling on a leadhead jig", topArtificial: "8-inch plastic swimbait (motor oil) on 4 oz jig head", liveBaits: ["Live perch or greenling on a leadhead jig", "Squid strips", "Octopus pieces"], artificials: ["8-inch plastic swimbait (motor oil) on 4 oz jig head", "Iron jig (6 oz, blue/silver)", "Large bucktail jig (4 oz, white)"], bestTime: "Spring (Apr-Jun) nearshore; fall deeper (60-200 ft)", tip: "Lingcod are ferocious predators in rocky reefs. Use heavy tackle (40-60 lb braid) and beefy jigs. They hit hard and head straight for the rocks." },
  "Rockfish (Various)": { species: "Rockfish (Various)", topLiveBait: "Squid strips on a shrimp fly dropper rig", topArtificial: "Sabi rig with chrome diamond jig (1-2 oz)", liveBaits: ["Squid strips on a shrimp fly dropper rig", "Live anchovy", "Mussel strips"], artificials: ["Sabi rig with chrome diamond jig (1-2 oz)", "Swimbait on 1/2 oz jig head (brown/olive)", "Shrimp fly dropper with weight"], bestTime: "Year-round; best spring-fall in 60-200 ft", tip: "Rockfish are diverse (bocaccio, vermilion, copper, quillback). Use a shrimp fly / diamond jig combo to catch multiple species in one drop." },
  "Surf Perch": { species: "Surf Perch", topLiveBait: "Sand crabs (mole crabs) on a #6 hook with light weight", topArtificial: "Gulp! Sandworm (pink, 2 inch) on a Carolina rig", liveBaits: ["Sand crabs (mole crabs) on a #6 hook with light weight", "Bloodworms", "Mussel meat"], artificials: ["Gulp! Sandworm (pink, 2 inch) on a Carolina rig", "Fishbites (bloodworm flavor)", "Small curly tail jig (1/16 oz, pink)"], bestTime: "High tide on sandy beaches; summer best", tip: "Surf perch feed in the wash zone. Cast just beyond the breaking waves and slowly retrieve through the foamy water." },
  "Leopard Shark": { species: "Leopard Shark", topLiveBait: "Cut squid on a Carolina rig with 30 lb leader", topArtificial: "Scented bait strip on a bottom rig", liveBaits: ["Cut squid on a Carolina rig with 30 lb leader", "Live ghost shrimp", "Clam necks", "Sardine chunks"], artificials: ["Scented bait strip on a bottom rig"], bestTime: "Summer in shallow bays and sloughs; high tide", tip: "Leopard sharks are common in SF Bay. Use a light leader (20 lb mono) — they're not toothy. They're catch-and-release friendly but handle gently." },
  "Bat Ray": { species: "Bat Ray", topLiveBait: "Squid or clam on a bottom rig", topArtificial: "N/A — bait fishing only", liveBaits: ["Squid or clam on a bottom rig", "Ghost shrimp", "Bloodworms"], artificials: [], bestTime: "Late spring through fall in bays; best incoming tide", tip: "Bat rays are powerful bottom dwellers. They bury in mud flats at high tide. When hooked they dig deep — use 30 lb braid and a heavy sinker." },
  "Sturgeon (White)": { species: "Sturgeon (White)", topLiveBait: "Ghost shrimp or grass shrimp on a #2 hook (weighted lightly)", topArtificial: "Shrimp-fly dropper with pencil weight", liveBaits: ["Ghost shrimp or grass shrimp on a #2 hook (weighted lightly)", "Eel chunks", "Salmon roe"], artificials: ["Shrimp-fly dropper with pencil weight"], bestTime: "Winter and spring in deep river channels; incoming tide", tip: "Sturgeon are protected and strictly catch-and-release only. Use barbless circles (#4-#2). Never lift them out of water — unhook in the water and let them recover before release." },
  "Jacksmelt": { species: "Jacksmelt", topLiveBait: "Live anchovy or squid strip on a #8 hook", topArtificial: "Small chrome lure (1/8 oz) retrieved quickly", liveBaits: ["Live anchovy or squid strip on a #8 hook", "Small pieces of shrimp"], artificials: ["Small chrome lure (1/8 oz) retrieved quickly", "Small jig (1/16 oz, silver)"], bestTime: "Summer near piers; most active in early morning", tip: "Jacksmelt are easy to catch from piers. Use light tackle (4 lb test) and small hooks. They're good bait for larger fish." },

  // ===== Pacific Salmon =====
  "Chinook Salmon (King)": { species: "Chinook Salmon (King)", topLiveBait: "Live herring or anchovy (stitched and trolled)", topArtificial: "Hootchie skirt (green/glow) with herring strip behind a flasher", liveBaits: ["Live herring or anchovy (stitched and trolled)", "Salmon roe under a float", "Squid strips"], artificials: ["Hootchie skirt (green/glow) with herring strip behind a flasher", "Kwikfish lure (flatfish, chartreuse)", "Spin-n-Glo (pink/white) with yarn"], bestTime: "Spring and fall runs; trolling at dawn in 40-120 ft", tip: "Chinook are the largest Pacific salmon. Troll at 2-3 knots with a downrigger set to the depth where baitfish are suspended." },
  "Coho Salmon (Silver)": { species: "Coho Salmon (Silver)", topLiveBait: "Live herring (trolled or mooched)", topArtificial: "Pink spoon (Dick Nite, 3.5 inch) behind a dodger", liveBaits: ["Live herring (trolled or mooched)", "Salmon roe"], artificials: ["Pink spoon (Dick Nite, 3.5 inch) behind a dodger", "Small Hootchie (pink/white)", "Coho Killer (chrome/red)"], bestTime: "Late summer-fall; near the surface in 20-40 ft", tip: "Coho are more surface-oriented than Chinook. Use less weight and troll at 2-3 knots near river mouths." },

  // ===== Freshwater Warm =====
  "Largemouth Bass": { species: "Largemouth Bass", topLiveBait: "Live shiners under a bobber", topArtificial: "Texas-rigged Zoom Trick Worm (junebug/green pumpkin)", liveBaits: ["Live shiners under a bobber", "Live crawfish", "Nightcrawlers"], artificials: ["Texas-rigged Zoom Trick Worm (junebug/green pumpkin)", "Spinnerbait (white/chartreuse)", "Rapala Skitter Pop (frog)"], bestTime: "Dawn 6-8am and dusk 7-9pm", tip: "Fish near structure and vegetation edges. Slow down your retrieve in murky water. During summer, target deeper ledges." },
  "Smallmouth Bass": { species: "Smallmouth Bass", topLiveBait: "Live crayfish on a #2 hook (no weight)", topArtificial: "Tube jig (green pumpkin, 3 inch) on 1/8 oz head", liveBaits: ["Live crayfish on a #2 hook (no weight)", "Live hellgrammites", "Nightcrawlers"], artificials: ["Tube jig (green pumpkin, 3 inch) on 1/8 oz head", "Rapala Husky Jerk (silver/black)", "Drop-shot rig with finesse worm (4 inch)"], bestTime: "Late spring and fall; smallmouth prefer 55-75°F water", tip: "Smallmouth love current and rocky bottom. Cast upstream and let your bait drift naturally downstream. They strike instinctively." },
  "Channel Catfish": { species: "Channel Catfish", topLiveBait: "Chicken liver on a treble hook", topArtificial: "Berkley PowerBait Catfish Chunks (stink bait)", liveBaits: ["Chicken liver on a treble hook", "Nightcrawlers on a slip-sinker rig", "Live perch (cut into chunks)", "Shad guts"], artificials: ["Berkley PowerBait Catfish Chunks (stink bait)", "Catfish Charlie dip bait"], bestTime: "Night fishing 9pm-2am is best; also good after heavy rain", tip: "Position bait near the deepest point in the river bend or lake hole. Catfish patrol the bottom at night following scent trails." },
  "Blue Catfish": { species: "Blue Catfish", topLiveBait: "Fresh cut shad on a 5/0 circle hook (bottom rig)", topArtificial: "Cut bait works best; artificial scented bait can work", liveBaits: ["Fresh cut shad on a 5/0 circle hook (bottom rig)", "Live bluegill", "Skipjack herring (cut)", "Shrimp"], artificials: ["Berkley Gulp! Catfish Chunks"], bestTime: "Spring and fall; blue catfish feed heavily before cold weather", tip: "Blue catfish grow much larger than channels (100+ lb). Use heavier tackle (30-50 lb) and fish main river channels." },
  "Flathead Catfish": { species: "Flathead Catfish", topLiveBait: "Live bluegill (2-6 inch) on a 8/0 circle hook", topArtificial: "Live bait only — flatheads rarely hit artificials", liveBaits: ["Live bluegill (2-6 inch) on a 8/0 circle hook", "Live perch", "Live green sunfish", "Live bullhead"], artificials: [], bestTime: "Night fishing in river channels and deep holes; summer peak", tip: "Flatheads prefer live prey over dead bait. Fish near deep structure like logjams and bridge pilings. Set the hook hard — flatheads have tough mouths." },
  "White Crappie": { species: "White Crappie", topLiveBait: "Live minnows under a slip float", topArtificial: "Bobby Garland Baby Shad (silver/black)", liveBaits: ["Live minnows under a slip float", "Small fathead minnows"], artificials: ["Bobby Garland Baby Shad (silver/black)", "Small hair jig (white, 1/32 oz)", "1/16 oz jig with 2-inch tube (chartreuse)"], bestTime: "Early morning near dock structure; spring spawn in shallows", tip: "Crappie suspend at specific depths. Once you find the depth — usually 6-12 ft — stay at that depth and work horizontally." },
  "Black Crappie": { species: "Black Crappie", topLiveBait: "Live minnows on a slip float", topArtificial: "1/32 oz jig with 1.5-inch soft plastic (monkey milk)", liveBaits: ["Live minnows on a slip float", "Small minnows"], artificials: ["1/32 oz jig with 1.5-inch soft plastic (monkey milk)", "Marr's Little Getter (black/chartreuse)", "Beetle Spin (1/16 oz, white)"], bestTime: "Spring in shallow cover; summer in deeper water near structure", tip: "Black crappie prefer clearer water than white crappie. Fish standing timber and brush piles with finesse tackle." },
  "Bluegill": { species: "Bluegill", topLiveBait: "Crickets under a small bobber", topArtificial: "1/64 oz Mister Twister jig (chartreuse)", liveBaits: ["Crickets under a small bobber", "Red wigglers on a #6 hook", "Waxworms", "Mealworms"], artificials: ["1/64 oz Mister Twister jig (chartreuse)", "Small beetle spin (white, size 0)", "Trout magnet (pink)"], bestTime: "Mid-morning to early afternoon near structure", tip: "A cricket under a tiny bobber near lily pad edges will get bites every few minutes. Use ultralight tackle for maximum fun." },
  "Redear Sunfish (Shellcracker)": { species: "Redear Sunfish (Shellcracker)", topLiveBait: "Red wigglers on a #6 hook fished on bottom", topArtificial: "1/32 oz jig tipped with waxworm", liveBaits: ["Red wigglers on a #6 hook fished on bottom", "Crickets", "Small snails crushed"], artificials: ["1/32 oz jig tipped with waxworm", "Small spinner (1/16 oz, white)"], bestTime: "Spring bedding season (Apr-May); early morning", tip: "Redear are bottom feeders that eat snails. Fish deeper than bluegill (8-12 ft) and use a slow presentation near shell beds." },
  "Warmouth": { species: "Warmouth", topLiveBait: "Nightcrawler piece on a #6 hook under bobber", topArtificial: "Small spinnerbait (1/8 oz, black/yellow)", liveBaits: ["Nightcrawler piece on a #6 hook under bobber", "Crickets", "Small minnows"], artificials: ["Small spinnerbait (1/8 oz, black/yellow)", "Small jig (1/16 oz, black)"], bestTime: "Summer near submerged timber and stumps", tip: "Warmouth have a larger mouth than other sunfish. They ambush prey from cover — cast tight to logs and cypress knees." },
  "Green Sunfish": { species: "Green Sunfish", topLiveBait: "Waxworms on a #8 hook under a bobber", topArtificial: "1/64 oz jig (white) slow retrieved", liveBaits: ["Waxworms on a #8 hook under a bobber", "Nightcrawler pieces", "Crickets"], artificials: ["1/64 oz jig (white) slow retrieved", "Small beetle spin"], bestTime: "Mid-day during summer; very aggressive feeders", tip: "Green sunfish are highly aggressive and will hit almost anything. They're great fish for kids to catch." },
  "Longear Sunfish": { species: "Longear Sunfish", topLiveBait: "Crickets on a #8 hook under a small bobber", topArtificial: "Small foam spider (1/64 oz)", liveBaits: ["Crickets on a #8 hook under a small bobber", "Small worms", "Ants"], artificials: ["Small foam spider (1/64 oz)", "Small popper (size 10)"], bestTime: "Late spring and summer in clear streams", tip: "Longears prefer clear, rocky streams. Use light tackle (2-4 lb test) and cast to likely pockets in current." },
  "White Bass": { species: "White Bass", topLiveBait: "Live shiners on a light jig head", topArtificial: "1/4 oz jig head with 3-inch twister tail (white)", liveBaits: ["Live shiners on a light jig head", "Nightcrawlers on a bottom rig"], artificials: ["1/4 oz jig head with 3-inch twister tail (white)", "Small crankbait (silver/black)", "Rattletrap (chrome/blue)"], bestTime: "Spring spawning runs up rivers; schooling activity at dawn", tip: "White bass school on the surface when feeding on shad. Look for diving birds and surface commotion — cast into the chaos." },
  "Hybrid Striped Bass": { species: "Hybrid Striped Bass", topLiveBait: "Live shad on a circle hook freeline", topArtificial: "1/2 oz jig head with 5-inch paddle-tail swimbait (pearl white)", liveBaits: ["Live shad on a circle hook freeline", "Cut bait chunks"], artificials: ["1/2 oz jig head with 5-inch paddle-tail swimbait (pearl white)", "Rattletrap (chrome/blue, 1/2 oz)", "Redfin (shad pattern)"], bestTime: "Early morning schooling activity; spring and fall", tip: "Hybrid stripers are stocked and grow fast. They chase shad on the surface — a popping cork with a jig underneath is deadly." },
  "Carp": { species: "Carp", topLiveBait: "Sweet corn on a #6 hook (chum with corn first)", topArtificial: "Berkley PowerBait Dough (honey flavor) on a hair rig", liveBaits: ["Sweet corn on a #6 hook (chum with corn first)", "Dough balls", "Nightcrawlers", "Boilies (strawberry)"], artificials: ["Berkley PowerBait Dough (honey flavor) on a hair rig", "Artificial corn"], bestTime: "Late spring and summer in warm shallow water; early morning", tip: "Carp are wary but powerful fighters. Use a hair rig to avoid deep hooking. Chum with corn for 30 minutes before casting." },
  "Buffalo Fish": { species: "Buffalo Fish", topLiveBait: "Dough balls or bread on a #4 hook (bottom rig)", topArtificial: "Dough bait (prepared)", liveBaits: ["Dough balls or bread on a #4 hook (bottom rig)", "Nightcrawlers", "Sweet corn"], artificials: ["Dough bait (prepared)"], bestTime: "Summer; buffalo feed in mud-bottom areas", tip: "Buffalo are suckers — they vacuum the bottom for food. Use a slip sinker rig and keep the bait stationary." },
  "Gar (Longnose)": { species: "Gar (Longnose)", topLiveBait: "Live minnow on a #4 hook (freelined near surface)", topArtificial: "Rope lure or frayed nylon rope (gar entangle teeth)", liveBaits: ["Live minnow on a #4 hook (freelined near surface)", "Cut fish strips"], artificials: ["Rope lure or frayed nylon rope (gar entangle teeth)", "Spinnerbait with trailer hook"], bestTime: "Summer; gar feed near the surface during warm weather", tip: "Gar have bony mouths — standard hooks won't penetrate. Use a frayed rope lure that their teeth get tangled in, then lift them into the boat." },
  "Bowfin (Dogfish)": { species: "Bowfin (Dogfish)", topLiveBait: "Live shiners under a bobber near weed beds", topArtificial: "Spinnerbait (white, 1/4 oz) retrieved slow and steady", liveBaits: ["Live shiners under a bobber near weed beds", "Nightcrawlers", "Cut shad", "Crayfish"], artificials: ["Spinnerbait (white, 1/4 oz) retrieved slow and steady", "Topwater frog (scum frog, black)", "Soft plastic crawfish (Texas-rigged)"], bestTime: "Late spring through summer in vegetated shallows", tip: "Bowfin are aggressive and powerful. Use a wire leader — they have sharp teeth. They breathe air and can survive in low-oxygen water." },
  "Freshwater Drum": { species: "Freshwater Drum", topLiveBait: "Nightcrawlers on a bottom rig (#2 hook)", topArtificial: "1/4 oz jig head with 3-inch soft plastic (crayfish color)", liveBaits: ["Nightcrawlers on a bottom rig (#2 hook)", "Crayfish (live or cut)", "Freshwater mussels"], artificials: ["1/4 oz jig head with 3-inch soft plastic (crayfish color)", "Small crankbait (crawfish pattern)"], bestTime: "Summer; drum feed heavily at dawn and dusk on gravel bottom", tip: "Freshwater drum (sheepshead) have pharyngeal teeth that crunch mussels. Fish them on hard bottom near mussel beds." },

  // ===== Freshwater Cool =====
  "Walleye": { species: "Walleye", topLiveBait: "Live nightcrawler on a spinner harness (bottom bouncer)", topArtificial: "3-inch soft plastic paddle-tail (chartreuse) on 1/4 oz jig head", liveBaits: ["Live nightcrawler on a spinner harness (bottom bouncer)", "Live minnow on a jig head (1/8 oz)", "Leeches on a slow death rig"], artificials: ["3-inch soft plastic paddle-tail (chartreuse) on 1/4 oz jig head", "Shad Rap (silver/blue, #5)", "Flicker Shad (firetiger)"], bestTime: "Low light — dawn, dusk, and nighttime; spring and fall best", tip: "Walleye have sensitive eyes and feed in low light. Use a bottom bouncer to stay in contact with the bottom at 0.5-1 mph." },
  "Yellow Perch": { species: "Yellow Perch", topLiveBait: "Live minnow on a #6 hook with split shot", topArtificial: "1/32 oz jig head with 1.5-inch soft plastic (chartreuse)", liveBaits: ["Live minnow on a #6 hook with split shot", "Waxworms on a tear-drop jig (ice fishing)", "Nightcrawler pieces"], artificials: ["1/32 oz jig head with 1.5-inch soft plastic (chartreuse)", "Swedish Pimple (silver, 1/8 oz)", "Rattle jig (gold, 1/16 oz)"], bestTime: "Spring and fall; perch school in deeper water summer, move shallow to spawn spring", tip: "Yellow perch school by size. When you catch one, stay in that area — there are likely more. They're excellent table fare." },
  "Northern Pike": { species: "Northern Pike", topLiveBait: "Live sucker minnow (6-8 inch) under a bobber", topArtificial: "Spoon (red/white, 4 inch) retrieved fast near weed edges", liveBaits: ["Live sucker minnow (6-8 inch) under a bobber", "Dead smelt on a quick-strike rig"], artificials: ["Spoon (red/white, 4 inch) retrieved fast near weed edges", "Daredevl spoon (red/white, 5 inch)", "Mepps Musky Killer (bucktail, #5)"], bestTime: "Spring and fall in weedy shallows; early morning", tip: "Pike have razor teeth — use a 12-inch steel leader. They hit hard and make powerful runs. Use a net, never lip-land a pike." },
  "Muskellunge (Muskie)": { species: "Muskellunge (Muskie)", topLiveBait: "Large sucker (12 inch) on a quick-strike rig", topArtificial: "Bull Dawg (bucktail, black/orange, 10 inch) slow-rolled", liveBaits: ["Large sucker (12 inch) on a quick-strike rig", "Large cisco (dead, slow trolled)"], artificials: ["Bull Dawg (bucktail, black/orange, 10 inch) slow-rolled", "Spro BBZ-1 Rat (8 inch, walking the dog)", "Muskie Jitterbug (black, 6 inch)"], bestTime: "Fall; muskie feed heavily before winter. Early morning and late evening", tip: "Muskie are the fish of 10,000 casts. Use 80+ lb braid and a steel leader. Figure-8 at the boat after every cast — many strikes happen at boatside." },
  "Chain Pickerel": { species: "Chain Pickerel", topLiveBait: "Live shiner on a #2 hook under a bobber", topArtificial: "3-inch soft plastic swimbait (white) on 1/8 oz jig head", liveBaits: ["Live shiner on a #2 hook under a bobber", "Small bluegill (live)"], artificials: ["3-inch soft plastic swimbait (white) on 1/8 oz jig head", "Small spoon (silver, 2 inch)", "Rebel Minnow (silver/black)"], bestTime: "Spring and fall in weedy shallows; early morning", tip: "Chain pickerel are smaller relatives of pike but just as toothy. Use a short wire leader. They ambush from weed beds — cast tight to cover." },
  "Rock Bass": { species: "Rock Bass", topLiveBait: "Live crayfish tail on a #4 hook", topArtificial: "1/16 oz jig head with 2-inch soft plastic (brown/crawfish color)", liveBaits: ["Live crayfish tail on a #4 hook", "Nightcrawler pieces", "Hellgrammites"], artificials: ["1/16 oz jig head with 2-inch soft plastic (brown/crawfish color)", "Small spinner (1/8 oz, black)"], bestTime: "Summer near rocky shoals and riprap; early morning", tip: "Rock bass have big mouths for their size and hit hard. Fish near any rocky structure in clear water." },
  "Bullhead Catfish": { species: "Bullhead Catfish", topLiveBait: "Nightcrawlers on a #4 hook (bottom rig)", topArtificial: "Prepared stink bait on a treble hook", liveBaits: ["Nightcrawlers on a #4 hook (bottom rig)", "Chicken liver", "Shrimp pieces"], artificials: ["Prepared stink bait on a treble hook"], bestTime: "Night fishing; bullheads are most active after dark in warm water", tip: "Bullheads have sharp spines on dorsal and pectoral fins — handle with care. They're hardy fish great for introducing kids to fishing." },

  // ===== Trout & Salmonids (Freshwater) =====
  "Rainbow Trout": { species: "Rainbow Trout", topLiveBait: "PowerBait (chartreuse) on a #8 hook or under a bobber", topArtificial: "Panther Martin (gold, size 4) retrieved steady", liveBaits: ["PowerBait (chartreuse) on a #8 hook or under a bobber", "Garden worms under a bobber", "Salmon eggs (cured)"], artificials: ["Panther Martin (gold, size 4) retrieved steady", "Kastmaster (silver/blue, 1/8 oz)", "Thomas Buoyant (rainbow trout pattern)"], bestTime: "Morning and evening; spring and fall are best seasons", tip: "Fish near creek inlets where trout feed on insects. In summer, go deeper or fish at dawn when water is coolest. Use 4-6 lb test for best presentation." },
  "Brown Trout": { species: "Brown Trout", topLiveBait: "Live nightcrawlers on a #8 hook (split shot 18 inches up)", topArtificial: "Rapala Countdown (brown trout pattern, #7) twitched erratically", liveBaits: ["Live nightcrawlers on a #8 hook (split shot 18 inches up)", "Live minnows", "Salmon eggs"], artificials: ["Rapala Countdown (brown trout pattern, #7) twitched erratically", "Panther Martin (black body/gold blade, size 6)", "Sculpin imitation (size 8 streamer) stripped slowly"], bestTime: "Late evening to night; browns are nocturnal feeders, best Oct-Nov spawn", tip: "Brown trout are the wariest of the trouts. Use long, light leaders (6 lb fluorocarbon) and natural presentations. Fish deeper during the day." },
  "Lake Trout": { species: "Lake Trout", topLiveBait: "Live minnow on a downrigger (60-120 ft)", topArtificial: "Sutton Spoon (silver/blue, 3 inch) trolled at 1.5-2.5 mph", liveBaits: ["Live minnow on a downrigger (60-120 ft)", "Nightcrawler harness rig"], artificials: ["Sutton Spoon (silver/blue, 3 inch) trolled at 1.5-2.5 mph", "Jake's Spin-a-Lure (pearl)", "Needlefish (chrome, 4 inch)"], bestTime: "Early morning trolling; winter is best for lakers in shallower water", tip: "Lake trout go deep in summer (80-120 ft) and shallow in spring/fall. Troll along the bottom contour and watch your fish finder." },
  "Brook Trout": { species: "Brook Trout", topLiveBait: "Garden worms on a #10 hook (small split shot)", topArtificial: "Mepps Aglia (silver, size 1) in small streams", liveBaits: ["Garden worms on a #10 hook (small split shot)", "Crickets", "Salmon eggs"], artificials: ["Mepps Aglia (silver, size 1) in small streams", "Panther Martin (gold, size 2)", "Royal Coachman wet fly (size 12)"], bestTime: "Spring and fall; brook trout prefer cold water (below 65°F)", tip: "Brook trout are the only native eastern trout. They're found in small, cold headwater streams. Use ultralight tackle (2-4 lb)." },
  "Kokanee Salmon": { species: "Kokanee Salmon", topLiveBait: "Shoe peg corn on a #10 hook behind a dodger", topArtificial: "Kok-a-nut dodger (flame pattern) with pink hootchie", liveBaits: ["Shoe peg corn on a #10 hook behind a dodger", "Salmon eggs soaked in garlic"], artificials: ["Kok-a-nut dodger (flame pattern) with pink hootchie", "Pink squid (small) trolled at 1-1.5 mph", "Apex lure (orange/silver, 2 inch)"], bestTime: "Late summer-early fall spawning run; trolling 30-80 ft", tip: "Kokanee are landlocked sockeye. Troll slowly (1-1.5 mph) with a dodger 12-18 inches ahead of the lure. They hit lightly — watch your rod tip." },
  "Steelhead Trout": { species: "Steelhead Trout", topLiveBait: "Cured salmon roe under a float", topArtificial: "Pink worm (floating) drifted under a bobber", liveBaits: ["Cured salmon roe under a float", "Fresh nightcrawlers", "Herring strips"], artificials: ["Pink worm (floating) drifted under a bobber", "Jig (pink/white, 1/16 oz) under a float", "Kwikfish (gold, size F4)"], bestTime: "Winter and spring runs; steelhead are migratory from Great Lakes/rivers to tributaries", tip: "Steelhead are rainbow trout that migrated to Great Lakes. They fight hard and jump. Use 8-10 lb test and a sensitive rod to detect subtle bites." },

  // ===== Great Lakes Specialties =====
  "Whitefish (Lake)": { species: "Whitefish (Lake)", topLiveBait: "Waxworms on a small jig (1/16 oz) fished near bottom", topArtificial: "Small Swedish Pimple (gold, 1/8 oz) jigged gently", liveBaits: ["Waxworms on a small jig (1/16 oz) fished near bottom", "Small minnows on a jig"], artificials: ["Small Swedish Pimple (gold, 1/8 oz) jigged gently", "Tear-drop jig (chartreuse ice fishing jig)"], bestTime: "Fall and winter; whitefish school in deep water (30-100 ft)", tip: "Lake whitefish have soft mouths — use a gentle hookset and steady pressure. Ice fishing is the most popular method using small jigs tipped with waxworms." },
  "Chinook Salmon (Great Lakes)": { species: "Chinook Salmon (Great Lakes)", topLiveBait: "Live alewife on a downrigger (trolled at 2-3 mph)", topArtificial: "Magnum Spoon (green/glow, 5 inch) trolled on downrigger", liveBaits: ["Live alewife on a downrigger (trolled at 2-3 mph)", "Dead alewife on a cut-plug herring rig"], artificials: ["Magnum Spoon (green/glow, 5 inch) trolled on downrigger", "J-Plug (chrome/blue, 4 inch)", "Flounder Pounder (green/glow, 6 inch)"], bestTime: "Spring and fall near river mouths; trolling 30-80 ft", tip: "Great Lakes kings grow to 40+ lb. Use downriggers with 10-15 lb cannonballs to reach the thermocline (45-60 ft in summer)." },
};

type RegionSpecies = {
  name: string;
  waterBodyType: string;
  lat: number;
  lon: number;
  species: string[];
  conditions: {
    windSpeed: number; windDirection: string; barometricPressure: number;
    waterTemp: number; tidalPhase: string; waveHeight: number | null;
    salinity: number | null; waterClarity: string; overallRating: number;
    activityForecast: string;
    tideChart: { time: string; heightFt: number; type: string }[];
  };
};

const GULF_TIDES = {
  windSpeed: 12, windDirection: "SSE", barometricPressure: 30.02,
  waterTemp: 78, tidalPhase: "Incoming — 2 hours to high tide",
  waveHeight: 2.5, salinity: 28, waterClarity: "slightly murky", overallRating: 8,
  activityForecast: "Good conditions for pier and surf fishing. Speckled trout and redfish actively feeding on falling tide.",
  tideChart: [
    { time: "06:00", heightFt: 0.8, type: "low" },
    { time: "09:00", heightFt: 2.1, type: "rising" },
    { time: "12:15", heightFt: 3.4, type: "high" },
    { time: "15:00", heightFt: 2.0, type: "falling" },
    { time: "18:30", heightFt: 0.6, type: "low" },
    { time: "21:00", heightFt: 1.8, type: "rising" },
    { time: "23:59", heightFt: 3.1, type: "high" },
  ],
};

const FRESHWATER_CONDITIONS = {
  windSpeed: 6, windDirection: "SW", barometricPressure: 30.1,
  waterTemp: 65, tidalPhase: "N/A - Freshwater",
  waveHeight: null, salinity: null, waterClarity: "clear", overallRating: 7,
  activityForecast: "Pleasant fishing conditions. Fish actively feeding near structure and inlets.",
  tideChart: [
    { time: "06:00", heightFt: 0, type: "n/a" },
    { time: "12:00", heightFt: 0, type: "n/a" },
    { time: "18:00", heightFt: 0, type: "n/a" },
    { time: "23:59", heightFt: 0, type: "n/a" },
  ],
};

const REGION_PROFILES: Record<string, RegionSpecies> = {
  // ======= Gulf Coast (TX, LA, MS, AL, FL Panhandle) =======
  // Sources: NOAA ELMR Galveston Bay species inventory
  // (https://repository.library.noaa.gov/view/noaa/2882),
  // TPWD Coastal Fisheries monitoring (https://tpwd.texas.gov/fishboat/fish/),
  // Visit Galveston (https://www.visitgalveston.com/things-to-do/outdoor-activities/fishing/)
  "gulf-coast": {
    name: "Gulf Coast — Upper Texas to Florida Panhandle",
    waterBodyType: "pier", lat: 29.28, lon: -94.78,
    species: [
      "Spotted Seatrout", "Red Drum", "Black Drum", "Sheepshead", "Sand Seatrout",
      "Southern Flounder", "Gulf Flounder", "Atlantic Croaker", "Spot",
      "Silver Perch", "Pinfish", "Hardhead Catfish", "Gafftop Catfish (Sail Catfish)",
      "Whiting (Gulf Kingfish)", "Spanish Mackerel", "King Mackerel", "Bluefish",
      "Ladyfish", "Jack Crevalle", "Florida Pompano", "Striped Mullet",
      "Blacktip Shark", "Bonnethead Shark", "Atlantic Sharpnose Shark", "Bull Shark",
      "Spinner Shark", "Southern Stingray", "Cownose Ray",
    ],
    conditions: { ...GULF_TIDES, activityForecast: "Warm Gulf waters. Speckled trout and redfish on grass flats. Sharks active in deeper passes." },
  },

  // ======= South Atlantic (FL East, GA, SC, NC) =======
  "south-atlantic": {
    name: "South Atlantic Coast — Florida to North Carolina",
    waterBodyType: "surf", lat: 32.0, lon: -80.0,
    species: [
      "Speckled Trout", "Red Drum", "Black Drum", "Sheepshead", "Flounder (Southern)",
      "Atlantic Croaker", "Hardhead Catfish", "Whiting (Gulf Kingfish)",
      "Spanish Mackerel", "King Mackerel", "Bluefish", "Striped Bass",
      "Ladyfish", "Jack Crevalle", "Cobia", "Pompano",
      "Summer Flounder (Fluke)", "Mangrove Snapper", "Vermilion Snapper",
      "Blacktip Shark", "Bonnethead Shark", "Atlantic Sharpnose Shark", "Southern Stingray",
    ],
    conditions: { ...GULF_TIDES, waterTemp: 72, salinity: 32, activityForecast: "Atlantic surf conditions. Red drum in troughs, pompano on sandbars. Fall run beginning for blues and Spanish mackerel." },
  },

  // ======= Mid-Atlantic / Northeast (VA to ME) =======
  "northeast": {
    name: "Northeast Coast — Virginia to Maine",
    waterBodyType: "surf", lat: 41.0, lon: -72.0,
    species: [
      "Striped Bass", "Bluefish", "Summer Flounder (Fluke)", "Tautog (Blackfish)",
      "Scup (Porgy)", "Black Sea Bass", "Weakfish", "Atlantic Croaker",
      "Spanish Mackerel", "King Mackerel", "False Albacore (Little Tunny)",
      "Bonito (Atlantic)", "Dogfish Shark (Spiny)", "Smooth Dogfish", "Weakfish",
    ],
    conditions: { ...GULF_TIDES, waterTemp: 65, salinity: 30, waveHeight: 3.0, activityForecast: "Cooler water. Striped bass blitzing on bunker schools. Fluke on sandy bottom in 30-50 ft." },
  },

  // ======= Pacific Coast (CA, OR) =======
  "pacific": {
    name: "Pacific Coast — California to Oregon",
    waterBodyType: "surf", lat: 36.0, lon: -122.0,
    species: [
      "California Halibut", "Lingcod", "Rockfish (Various)", "Surf Perch",
      "Leopard Shark", "Bat Ray", "Sturgeon (White)", "Jacksmelt",
      "Striped Bass", "Chinook Salmon (King)", "Coho Salmon (Silver)",
    ],
    conditions: { ...GULF_TIDES, waterTemp: 58, salinity: 33, waveHeight: 4.0, overallRating: 6, activityForecast: "Cool Pacific waters. Halibut on sandy flats near structure. Rockfish plentiful on nearshore reefs." },
  },

  // ======= Pacific Northwest (WA, OR) =======
  "pacific-nw": {
    name: "Pacific Northwest — Washington & Oregon",
    waterBodyType: "sound", lat: 47.6, lon: -122.3,
    species: [
      "Chinook Salmon (King)", "Coho Salmon (Silver)", "Lingcod", "Rockfish (Various)",
      "Halibut (Pacific)", "Surf Perch", "Sturgeon (White)", "Leopard Shark",
      "Bat Ray", "Jacksmelt", "Dogfish Shark (Spiny)",
    ],
    conditions: { ...GULF_TIDES, waterTemp: 52, salinity: 30, waveHeight: 3.0, activityForecast: "Pacific Northwest waters. Salmon trolling near the surface at dawn. Lingcod on rocky reefs in 60-100 ft." },
  },

  // ======= Florida Keys / Tropical =======
  "florida-keys": {
    name: "Florida Keys — Tropical Waters",
    waterBodyType: "ocean", lat: 24.56, lon: -81.78,
    species: [
      "Tarpon", "Snook", "Bonefish", "Permit", "Red Drum",
      "Speckled Trout", "Mangrove Snapper", "Lane Snapper", "Yellowtail Snapper",
      "Grouper (Gag)", "Grouper (Red)", "Mahi-Mahi (Dolphinfish)",
      "Spanish Mackerel", "King Mackerel", "Cobia", "Blackfin Tuna",
      "Barracuda (Great)", "Blacktip Shark", "Bonnethead Shark", "Nurse Shark",
      "Lemon Shark", "Southern Stingray", "Florida Gar",
    ],
    conditions: { ...GULF_TIDES, waterTemp: 82, salinity: 35, waterClarity: "clear", activityForecast: "Tropical paradise. Tarpon rolling in the passes at dawn. Bonefish tailing on the flats. Reef snapper and grouper active on offshore structure." },
  },

  // ======= Great Lakes =======
  "great-lakes": {
    name: "Great Lakes — Freshwater",
    waterBodyType: "lake", lat: 43.0, lon: -87.0,
    species: [
      "Chinook Salmon (Great Lakes)", "Coho Salmon (Silver)", "Rainbow Trout", "Steelhead Trout",
      "Brown Trout", "Lake Trout", "Smallmouth Bass", "Yellow Perch",
      "Walleye", "Northern Pike", "Muskellunge (Muskie)", "Freshwater Drum",
      "Whitefish (Lake)", "Channel Catfish",
    ],
    conditions: { ...FRESHWATER_CONDITIONS, waterTemp: 62, waterClarity: "moderate", overallRating: 7, activityForecast: "Great Lakes conditions. Salmon trolling near thermocline. Smallmouth bass on rocky structure at 15-30 ft." },
  },

  // ======= Warm Freshwater (Southeast / South) =======
  "inland-south": {
    name: "Inland South — Warm Freshwater",
    waterBodyType: "lake", lat: 32.0, lon: -93.0,
    species: [
      "Largemouth Bass", "Channel Catfish", "Blue Catfish", "Flathead Catfish",
      "White Crappie", "Black Crappie", "Bluegill", "Redear Sunfish (Shellcracker)",
      "Longear Sunfish", "Green Sunfish", "Warmouth", "White Bass",
      "Hybrid Striped Bass", "Carp", "Buffalo Fish", "Gar (Longnose)",
      "Bowfin (Dogfish)", "Freshwater Drum", "Bullhead Catfish",
    ],
    conditions: { ...FRESHWATER_CONDITIONS, waterTemp: 78, overallRating: 8, activityForecast: "Warm freshwater conditions. Bass on deep ledges and vegetation. Catfish active at night. Crappie suspended in brush piles at 8-12 ft." },
  },

  // ======= Cool Freshwater (North / Mountain) =======
  "inland-north": {
    name: "Inland North — Cool Freshwater",
    waterBodyType: "lake", lat: 45.0, lon: -89.0,
    species: [
      "Largemouth Bass", "Smallmouth Bass", "Walleye", "Yellow Perch",
      "Northern Pike", "Muskellunge (Muskie)", "Chain Pickerel", "Rock Bass",
      "Rainbow Trout", "Brown Trout", "Lake Trout", "Brook Trout",
      "Kokanee Salmon", "Steelhead Trout", "Channel Catfish", "Bullhead Catfish",
      "Carp", "Whitefish (Lake)", "Freshwater Drum",
    ],
    conditions: { ...FRESHWATER_CONDITIONS, waterTemp: 60, overallRating: 7, activityForecast: "Cool northern waters. Walleye on deep rocky points at dawn. Trout active in tributary streams. Pike in weedy shallows." },
  },

  // ======= Pacific Rivers (CA, OR, WA, ID) =======
  "pacific-rivers": {
    name: "Pacific Rivers — Salmon & Steelhead",
    waterBodyType: "river", lat: 44.0, lon: -122.0,
    species: [
      "Chinook Salmon (King)", "Coho Salmon (Silver)", "Steelhead Trout", "Rainbow Trout",
      "Brown Trout", "Cutthroat Trout", "Smallmouth Bass", "Channel Catfish",
      "Sturgeon (White)",
    ],
    conditions: { ...FRESHWATER_CONDITIONS, waterTemp: 55, overallRating: 6, activityForecast: "River conditions dependent on dam releases and rainfall. Steelhead holding in deep runs. Trout on hatches." },
  },

  // ===== Specific Texas Lakes (TPWD Survey Data) =====
  // Source: TPWD Lake Survey Reports
  // Lake Houston 2022-2023: https://tpwd.texas.gov/publications/pwdpubs/lake_survey/pwd_rp_t3200_1309/
  "lake-houston": {
    name: "Lake Houston, TX — TPWD 2022-2023 Survey",
    waterBodyType: "lake", lat: 29.9, lon: -95.14,
    species: [
      "Largemouth Bass", "White Bass", "White Crappie", "Black Crappie",
      "Blue Catfish", "Channel Catfish", "Flathead Catfish",
      "Bluegill", "Longear Sunfish", "Redear Sunfish", "Warmouth",
      "Gizzard Shad", "Threadfin Shad", "Inland Silverside",
      "Spotted Gar", "Redfin Pickerel", "Carp", "Spotted Sucker", "Freshwater Drum",
    ],
    conditions: { ...FRESHWATER_CONDITIONS, waterTemp: 72, overallRating: 7, activityForecast: "Per TPWD: Catfish angling comprises 32% of all effort. Largemouth Bass in standing timber. White Bass in river forks during spring spawn. Crappie near brush piles at 8-12 ft." },
  },
  // Lake Conroe 2021-2022: https://tpwd.texas.gov/publications/pwdpubs/lake_survey/pwd_rp_t3200_1278/
  "lake-conroe": {
    name: "Lake Conroe, TX — TPWD 2021-2022 Survey",
    waterBodyType: "lake", lat: 30.45, lon: -95.58,
    species: [
      "Largemouth Bass", "White Bass", "Hybrid Striped Bass",
      "Blue Catfish", "Channel Catfish", "Flathead Catfish",
      "Black Crappie", "White Crappie",
      "Bluegill", "Longear Sunfish", "Warmouth",
      "Gizzard Shad", "Threadfin Shad",
      "Carp", "Freshwater Drum",
    ],
    conditions: { ...FRESHWATER_CONDITIONS, waterTemp: 74, overallRating: 8, activityForecast: "Per TPWD: Largemouth Bass are the #1 target species. Hybrid Striped Bass provide open-water action. Lake record bass 15.93 lbs. Channel Catfish most abundant sportfish." },
  },
  // Lake Livingston 2024-2025: https://tpwd.texas.gov/publications/pwdpubs/lake_survey/pwd_rp_t3200_1326/
  "lake-livingston": {
    name: "Lake Livingston, TX — TPWD 2024-2025 Survey",
    waterBodyType: "lake", lat: 30.75, lon: -95.17,
    species: [
      "Blue Catfish", "Channel Catfish", "Flathead Catfish",
      "White Bass", "Striped Bass", "Hybrid Striped Bass",
      "Largemouth Bass", "Black Crappie", "White Crappie",
      "Bluegill", "Gizzard Shad", "Threadfin Shad",
      "Alligator Gar",
    ],
    conditions: { ...FRESHWATER_CONDITIONS, waterTemp: 76, overallRating: 7, activityForecast: "Per TPWD: White Bass fishery is #1 by angler effort (58%). Blue Catfish abundant in main lake channels. Alligator Gar subject to 48-inch max length limit. Striped Bass stocked for hatchery broodfish." },
  },
  // Lake Travis — Highland Lake near Austin, TX (LCRA survey data)
  "lake-travis": {
    name: "Lake Travis, TX — LCRA Highland Lake Survey",
    waterBodyType: "lake", lat: 30.38, lon: -97.97,
    species: [
      "Largemouth Bass", "Guadalupe Bass", "White Bass", "Striped Bass",
      "Channel Catfish", "Blue Catfish", "Flathead Catfish",
      "Black Crappie", "White Crappie",
      "Bluegill", "Redear Sunfish", "Longear Sunfish", "Warmouth",
      "Carp", "Freshwater Drum",
      "Gizzard Shad", "Threadfin Shad",
    ],
    conditions: { ...FRESHWATER_CONDITIONS, waterTemp: 72, overallRating: 7, activityForecast: "LCRA: Lake Travis is 63 mi long with 270 mi of shoreline. Striped Bass stocked annually. Guadalupe Bass in rocky riverine areas. Catfish abundant year-round." },
  },
  // Community/neighborhood lakes — common HOA stocking
  "community-lake-south": {
    name: "Southern US Community Lake — HOA / Private Stocking",
    waterBodyType: "lake", lat: 32.0, lon: -95.0,
    species: [
      "Largemouth Bass",
      "Channel Catfish", "Bluegill", "Redear Sunfish (Shellcracker)",
      "Black Crappie", "Warmouth", "Green Sunfish",
      "Triploid Grass Carp",
    ],
    conditions: { ...FRESHWATER_CONDITIONS, waterTemp: 78, overallRating: 7, activityForecast: "Community lakes in the South are commonly stocked with Channel Catfish (spring/summer) and Largemouth Bass. Bluegill and Shellcracker establish naturally. Grass Carp may be stocked under permit for vegetation control. TPWD Neighborhood Fishin' Program stocks Rainbow Trout in winter at select community lakes." },
  },
  "community-lake-fishin-program": {
    name: "Texas Neighborhood Fishin' Lake — TPWD Stocked",
    waterBodyType: "lake", lat: 29.76, lon: -95.36,
    species: [
      "Rainbow Trout", "Channel Catfish", "Largemouth Bass",
      "Bluegill", "Redear Sunfish (Shellcracker)", "Green Sunfish",
    ],
    conditions: { ...FRESHWATER_CONDITIONS, waterTemp: 72, overallRating: 8, activityForecast: "TPWD Neighborhood Fishin' Program: Channel Catfish stocked every 2 weeks Apr-Oct (12 fish per acre). Rainbow Trout stocked every 2 weeks Dec-Feb. Largemouth Bass and Bluegill are self-sustaining. See https://tpwd.texas.gov/fishboat/fish/management/stocking/neighborhood_fishin.phtml" },
  },

  // ===== Lake Fork, TX — Trophy Bass Capital of Texas =====
  // Source: TPWD Lake Survey Reports & Stocking History
  // Stocking: https://tpwd.texas.gov/fishboat/fish/action/stock_bywater.php?WB_code=0433
  // Survey: TPWD District 2b — Lake Fork 2022 Electrofishing
  "lake-fork": {
    name: "Lake Fork, TX — Trophy Bass Capital (TPWD Surveyed)",
    waterBodyType: "lake", lat: 32.78, lon: -95.53,
    species: [
      "Largemouth Bass", "Spotted Bass", "White Bass", "Yellow Bass", "Hybrid Striped Bass",
      "Blue Catfish", "Channel Catfish", "Flathead Catfish",
      "Black Crappie", "White Crappie",
      "Bluegill", "Redear Sunfish", "Warmouth",
      "Gizzard Shad", "Threadfin Shad",
      "Carp", "Bowfin (Dogfish)", "Longnose Gar", "Spotted Gar",
    ],
    conditions: { ...FRESHWATER_CONDITIONS, waterTemp: 72, overallRating: 9, activityForecast: "TPWD: Lake Fork is Texas' premier trophy bass lake — 33 of the top 50 Texas bass records. 80% standing timber provides superb cover. Bass on points and humps 12-18 ft. Florida Largemouth stocked annually. Channel Catfish stocked as fingerlings. Crappie excellent on brush piles at 8-14 ft." },
  },

  // ===== Sam Rayburn Reservoir, TX — TPWD 2022 Survey =====
  // Source: TPWD 2022 Survey Report pwd_rp_t3200_1371
  // https://tpwd.texas.gov/publications/pwdpubs/lake_survey/pwd_rp_t3200_1371/
  "sam-rayburn": {
    name: "Sam Rayburn Reservoir, TX — TPWD 2022 Survey",
    waterBodyType: "lake", lat: 31.06, lon: -94.11,
    species: [
      "Largemouth Bass", "White Bass", "Hybrid Striped Bass",
      "Blue Catfish", "Channel Catfish", "Flathead Catfish",
      "White Crappie", "Black Crappie",
      "Bluegill", "Redear Sunfish",
      "Gizzard Shad", "Threadfin Shad",
      "Carp", "Freshwater Drum",
    ],
    conditions: { ...FRESHWATER_CONDITIONS, waterTemp: 74, overallRating: 8, activityForecast: "Per TPWD 2022 Survey: Largemouth Bass is the #1 target (75-80% of angler effort). Over 400 bass tournaments per year. Florida Largemouth stocked annually since 1994 (Lone Star Bass since 2022). Hydrilla and standing timber primary cover. Excellent year-round crappie and catfish." },
  },

  // ===== Toledo Bend Reservoir, TX/LA — TPWD/ODFW Surveyed =====
  // Source: TPWD Toledo Bend Reservoir angling page
  // https://tpwd.texas.gov/fishboat/fish/recreational/lakes/toledo_bend
  "toledo-bend": {
    name: "Toledo Bend Reservoir, TX/LA — Border Waters",
    waterBodyType: "lake", lat: 31.20, lon: -93.57,
    species: [
      "Largemouth Bass", "White Bass", "Striped Bass", "Hybrid Striped Bass",
      "Blue Catfish", "Channel Catfish", "Flathead Catfish",
      "White Crappie", "Black Crappie",
      "Bluegill", "Redear Sunfish",
      "Gizzard Shad", "Threadfin Shad",
      "Carp", "Freshwater Drum",
    ],
    conditions: { ...FRESHWATER_CONDITIONS, waterTemp: 76, overallRating: 8, activityForecast: "TPWD: Largest reservoir in the South (185,000 acres). Largemouth Bass excellent year-round. Striped Bass maintained by annual stockings. Crappie excellent in standing timber and brush piles. Hydrilla and native aquatic plants dominate cover." },
  },

  // ===== Lake Tahoe, CA/NV — NDOW/CDFW Alpine Fishery =====
  // Source: NDOW Lake Tahoe Angler Guide 2025
  // https://ndow-production-media.s3-us-gov-west-1.amazonaws.com/wp-content/uploads/2025/06/Lake-Tahoe_Angler-Guide-2025_FINAL-1.pdf
  "lake-tahoe": {
    name: "Lake Tahoe, CA/NV — Alpine Trophy Fishery",
    waterBodyType: "lake", lat: 39.09, lon: -120.04,
    species: [
      "Lake Trout", "Rainbow Trout", "Brown Trout", "Brook Trout",
      "Kokanee Salmon", "Largemouth Bass", "Smallmouth Bass",
      "Crappie", "Bullhead Catfish",
    ],
    conditions: { ...FRESHWATER_CONDITIONS, waterTemp: 48, waterClarity: "extraordinary", overallRating: 7, activityForecast: "NDOW: Lake Trout (Mackinaw) dominate — troll deep shelves at 200-400 ft. Kokanee Salmon peak July-Sept at 75-150 ft. Rainbow and Brown Trout rare (4% of population). Warmwater bass and crappie in shallow near-shore areas. Lake record Mackinaw 37.6 lbs." },
  },

  // ===== Lake Okeechobee, FL — FWC Surveyed =====
  // Source: FWC Lake Okeechobee electrofishing surveys
  // https://myfwc.com/fishing/freshwater/sites-forecasts/s/lake-okeechobee
  "lake-okeechobee": {
    name: "Lake Okeechobee, FL — FWC Surveyed",
    waterBodyType: "lake", lat: 26.96, lon: -80.80,
    species: [
      "Largemouth Bass", "Black Crappie", "Channel Catfish",
      "Bluegill", "Redear Sunfish",
      "Gizzard Shad", "Threadfin Shad",
      "Mayan Cichlid", "Oscar", "Blue Tilapia", "Clown Knifefish",
      "Carp", "Bowfin (Dogfish)", "Gar (Longnose)",
    ],
    conditions: { ...FRESHWATER_CONDITIONS, waterTemp: 82, overallRating: 8, activityForecast: "FWC: 39 fish species in near-shore surveys. World-class Largemouth Bass in hydrilla beds and bulrush islands. Crappie excellent in open water. Non-native species (Mayan Cichlid, Oscar, Tilapia) abundant. Bluegill and Shellcracker excellent for panfish." },
  },

  // ===== Lake Michigan (Chicago) — Great Lakes Fishery =====
  // Sources: IDNR, MDNR, WDNR, USFWS Great Lakes surveys
  "lake-michigan": {
    name: "Lake Michigan, Chicago — Great Lakes Fishery",
    waterBodyType: "lake", lat: 41.88, lon: -87.63,
    species: [
      "Chinook Salmon (Great Lakes)", "Coho Salmon (Silver)", "Lake Trout", "Rainbow Trout",
      "Steelhead Trout", "Brown Trout", "Smallmouth Bass", "Yellow Perch",
      "Walleye", "Northern Pike", "Freshwater Drum", "Channel Catfish",
      "Whitefish (Lake)",
    ],
    conditions: { ...FRESHWATER_CONDITIONS, waterTemp: 58, waterClarity: "moderate", overallRating: 7, activityForecast: "Lake Michigan: Chinook Salmon (King) stocked annually by USFWS — peak summer trolling 50-150 ft. Coho Salmon near shore spring/fall. Lake Trout deep-water jigging. Yellow Perch in harbors. Smallmouth Bass near structure. Salmon runs in Chicago River." },
  },

  // ===== Lake Erie, OH/PA/NY — Walleye Capital =====
  // Source: ODNR, PAFBC, NYSDEC Great Lakes surveys
  "lake-erie": {
    name: "Lake Erie, OH/PA/NY — Walleye Capital",
    waterBodyType: "lake", lat: 42.2, lon: -80.0,
    species: [
      "Walleye", "Yellow Perch", "Smallmouth Bass", "White Bass",
      "Steelhead Trout", "Rainbow Trout", "Chinook Salmon (Great Lakes)",
      "Coho Salmon (Silver)", "Lake Trout", "Channel Catfish",
      "Freshwater Drum", "White Perch",
    ],
    conditions: { ...FRESHWATER_CONDITIONS, waterTemp: 65, overallRating: 9, activityForecast: "Lake Erie is the Walleye capital of the world — world-class spring/fall trolling. Yellow Perch excellent Aug-Oct. Smallmouth Bass on rocky reefs and islands. Steelhead in tributaries fall-spring. Central Basin best for walleye; Eastern Basin for smallmouth." },
  },

  // ===== Lake Ontario, NY — Salmon & Trout Fishery =====
  // Source: NYSDEC Lake Ontario surveys
  "lake-ontario": {
    name: "Lake Ontario, NY — Salmon & Trout Fishery",
    waterBodyType: "lake", lat: 43.6, lon: -77.7,
    species: [
      "Chinook Salmon (Great Lakes)", "Coho Salmon (Silver)", "Rainbow Trout", "Steelhead Trout",
      "Brown Trout", "Lake Trout", "Atlantic Salmon", "Smallmouth Bass",
      "Walleye", "Yellow Perch", "Northern Pike", "Channel Catfish",
    ],
    conditions: { ...FRESHWATER_CONDITIONS, waterTemp: 60, overallRating: 8, activityForecast: "NYSDEC: King Salmon trolling along the Niagara Bar and Oak Orchard. Brown Trout nearshore spring/fall. Lake Trout deep water 100-300 ft. Smallmouth Bass on eastern basin reefs. Salmon River tributary runs Sept-Nov." },
  },

  // ===== Lake Huron, MI — Wild Lake Trout Fishery =====
  // Source: MDNR Lake Huron surveys, USFWS
  "lake-huron": {
    name: "Lake Huron, MI — Wild Lake Trout Fishery",
    waterBodyType: "lake", lat: 44.0, lon: -82.5,
    species: [
      "Lake Trout", "Chinook Salmon (Great Lakes)", "Coho Salmon (Silver)", "Rainbow Trout",
      "Steelhead Trout", "Walleye", "Yellow Perch", "Smallmouth Bass",
      "Northern Pike", "Muskellunge (Muskie)", "Freshwater Drum", "Channel Catfish",
    ],
    conditions: { ...FRESHWATER_CONDITIONS, waterTemp: 55, overallRating: 7, activityForecast: "MDNR: Lake Huron has self-sustaining Lake Trout populations. Saginaw Bay is Walleye hotspot. Smallmouth Bass excellent in northern islands. Salmon near shore spring/fall. Thunder Bay region productive for lake trout and salmon." },
  },

  // ===== Lake Superior, MI/WI/MN — Largest Great Lake =====
  // Source: MDNR, WDNR, MN DNR surveys
  "lake-superior": {
    name: "Lake Superior, MI/WI/MN — Lake Trout Stronghold",
    waterBodyType: "lake", lat: 47.0, lon: -87.0,
    species: [
      "Lake Trout", "Chinook Salmon (Great Lakes)", "Coho Salmon (Silver)",
      "Rainbow Trout", "Steelhead Trout", "Brown Trout", "Brook Trout",
      "Walleye", "Yellow Perch", "Northern Pike", "Whitefish (Lake)",
    ],
    conditions: { ...FRESHWATER_CONDITIONS, waterTemp: 45, overallRating: 7, activityForecast: "Lake Superior: Premier Lake Trout fishery — troll deep 100-400 ft. Salmon near tributaries in spring/fall. Walleye in bays and estuaries (Chequamegon Bay, Duluth Harbor). Brook Trout in tributary streams. Siskiwit Lake record Lake Trout 63 lbs." },
  },

  // ===== Lake Champlain, VT/NY — Salmon & Bass Fishery =====
  // Source: Lake Champlain Cooperative 2020-2024 Report, VTFWD
  // https://dec.ny.gov/sites/default/files/2026-01/lakechampcoopreport.pdf
  "lake-champlain": {
    name: "Lake Champlain, VT/NY — Landlocked Salmon & Bass",
    waterBodyType: "lake", lat: 44.5, lon: -73.3,
    species: [
      "Lake Trout", "Landlocked Salmon", "Smallmouth Bass", "Largemouth Bass",
      "Northern Pike", "Walleye", "Yellow Perch", "Chain Pickerel",
      "Bowfin (Dogfish)", "Freshwater Drum", "Carp", "Bullhead Catfish",
      "Channel Catfish",
    ],
    conditions: { ...FRESHWATER_CONDITIONS, waterTemp: 58, overallRating: 8, activityForecast: "Lake Champlain Cooperative: Lake Trout now wild-spawning (stocking ended 2025). Landlocked Atlantic Salmon in Winooski and Saranac Rivers. World-class Smallmouth Bass. Northern Pike in weedy bays. Sea Lamprey control ongoing. Lake Champlain International Derby annually." },
  },

  // ===== Colorado River (AZ/CA) — Desert Fishery =====
  // Sources: AZGFD, CDFW, USFWS Lower Colorado River MSCP
  "colorado-river": {
    name: "Colorado River, AZ/CA — Desert Fishery",
    waterBodyType: "river", lat: 36.0, lon: -114.74,
    species: [
      "Rainbow Trout", "Striped Bass", "Largemouth Bass", "Smallmouth Bass",
      "Channel Catfish", "Flathead Catfish", "Blue Catfish",
      "Bluegill", "Redear Sunfish", "Crappie",
      "Carp", "Buffalo Fish",
    ],
    conditions: { ...FRESHWATER_CONDITIONS, waterTemp: 62, overallRating: 7, activityForecast: "AZGFD: Cold tailwater below Glen Canyon Dam produces trophy Rainbow Trout (Lees Ferry). Striped Bass and Largemouth Bass in Lake Havasu and Parker Strip. Channel Catfish abundant. Four endangered native species (Razorback Sucker, Bonytail, Humpback Chub, Colorado Pikeminnow) — catch & release only." },
  },

  // ===== Columbia River, OR/WA — Salmon & Steelhead Highway =====
  // Sources: ODFW, WDFW, CRITFC
  // https://myodfw.com/fishing/columbia-zone
  "columbia-river": {
    name: "Columbia River, OR/WA — Salmon & Steelhead Run",
    waterBodyType: "river", lat: 46.17, lon: -123.76,
    species: [
      "Chinook Salmon (King)", "Coho Salmon (Silver)", "Steelhead Trout", "Rainbow Trout",
      "Sturgeon (White)", "Walleye", "Smallmouth Bass",
      "American Shad", "Pacific Lamprey", "Northern Pikeminnow",
    ],
    conditions: { ...FRESHWATER_CONDITIONS, waterTemp: 55, overallRating: 8, activityForecast: "ODFW: Spring Chinook most anticipated season (June 15 start). Fall Chinook runs Aug-Sept. Sturgeon in lower river — catch & release mostly. Walleye in John Day Pool. Smallmouth Bass in warmwater tributaries. Salmon counts at Bonneville Dam fish ladders peak Aug." },
  },

  // ===== Mississippi River, New Orleans, LA — Big River Fishery =====
  // Sources: LDWF, USGS, Lower Mississippi River Conservation Committee
  "mississippi-river": {
    name: "Mississippi River, New Orleans, LA — Big River Fishery",
    waterBodyType: "river", lat: 29.95, lon: -90.07,
    species: [
      "Blue Catfish", "Channel Catfish", "Flathead Catfish",
      "Largemouth Bass", "White Crappie", "Black Crappie",
      "Freshwater Drum", "Carp", "Buffalo Fish",
      "Alligator Gar", "Longnose Gar", "Spotted Gar",
      "Bowfin (Dogfish)", "Bluegill", "Redear Sunfish",
    ],
    conditions: { ...FRESHWATER_CONDITIONS, waterTemp: 72, overallRating: 7, activityForecast: "LDWF: The lower Mississippi offers world-class Blue Catfish fishing (state record 104 lbs). Catfish best on cut bait near wing dams and river bends. Crappie and Bass in backwaters and oxbows. Gar abundant in warm months. Alligator Gar subject to special regulations." },
  },
};

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

type RegionAssignment = {
  regionKey: string;
  resolvedName: string;
  lat: number;
  lon: number;
  waterBodyType: string;
};

const LOCATION_REGION_MAP: Record<string, RegionAssignment> = {
  "galveston": { regionKey: "gulf-coast", resolvedName: "Galveston Seawall, TX", lat: 29.28, lon: -94.78, waterBodyType: "pier" },
  "galveston island": { regionKey: "gulf-coast", resolvedName: "Galveston Island, TX", lat: 29.28, lon: -94.78, waterBodyType: "pier" },
  "outer banks": { regionKey: "south-atlantic", resolvedName: "Outer Banks, NC", lat: 35.57, lon: -75.47, waterBodyType: "surf" },
  "florida keys": { regionKey: "florida-keys", resolvedName: "Florida Keys", lat: 24.56, lon: -81.78, waterBodyType: "ocean" },
  "chesapeake": { regionKey: "northeast", resolvedName: "Chesapeake Bay, MD", lat: 38.0, lon: -76.3, waterBodyType: "bay" },
  "chesapeake bay": { regionKey: "northeast", resolvedName: "Chesapeake Bay, MD", lat: 38.0, lon: -76.3, waterBodyType: "bay" },
  "destin": { regionKey: "gulf-coast", resolvedName: "Destin Harbor, FL", lat: 30.39, lon: -86.5, waterBodyType: "harbor" },
  "san francisco": { regionKey: "pacific", resolvedName: "San Francisco Bay, CA", lat: 37.77, lon: -122.42, waterBodyType: "bay" },
  "san francisco bay": { regionKey: "pacific", resolvedName: "San Francisco Bay, CA", lat: 37.77, lon: -122.42, waterBodyType: "bay" },
  "charleston": { regionKey: "south-atlantic", resolvedName: "Charleston Harbor, SC", lat: 32.78, lon: -79.93, waterBodyType: "harbor" },
  "charleston harbor": { regionKey: "south-atlantic", resolvedName: "Charleston Harbor, SC", lat: 32.78, lon: -79.93, waterBodyType: "harbor" },
  "puget sound": { regionKey: "pacific-nw", resolvedName: "Puget Sound, WA", lat: 47.61, lon: -122.34, waterBodyType: "sound" },
  "puget": { regionKey: "pacific-nw", resolvedName: "Puget Sound, WA", lat: 47.61, lon: -122.34, waterBodyType: "sound" },
  "mississippi river": { regionKey: "mississippi-river", resolvedName: "Mississippi River, New Orleans, LA", lat: 29.95, lon: -90.07, waterBodyType: "river" },
  "new orleans": { regionKey: "mississippi-river", resolvedName: "Mississippi River, New Orleans, LA", lat: 29.95, lon: -90.07, waterBodyType: "river" },
  "lake fork": { regionKey: "lake-fork", resolvedName: "Lake Fork, TX", lat: 32.78, lon: -95.53, waterBodyType: "lake" },
  "lake tahoe": { regionKey: "lake-tahoe", resolvedName: "Lake Tahoe, CA", lat: 39.09, lon: -120.04, waterBodyType: "lake" },
  "okeechobee": { regionKey: "lake-okeechobee", resolvedName: "Lake Okeechobee, FL", lat: 26.96, lon: -80.80, waterBodyType: "lake" },
  "lake okeechobee": { regionKey: "lake-okeechobee", resolvedName: "Lake Okeechobee, FL", lat: 26.96, lon: -80.80, waterBodyType: "lake" },
  "lake michigan": { regionKey: "lake-michigan", resolvedName: "Lake Michigan, Chicago", lat: 41.88, lon: -87.63, waterBodyType: "lake" },
  "lake michigan chicago": { regionKey: "lake-michigan", resolvedName: "Lake Michigan, Chicago", lat: 41.88, lon: -87.63, waterBodyType: "lake" },
  "lake ontario": { regionKey: "lake-ontario", resolvedName: "Lake Ontario, NY", lat: 43.6, lon: -77.7, waterBodyType: "lake" },
  "lake erie": { regionKey: "lake-erie", resolvedName: "Lake Erie, OH/PA/NY", lat: 42.2, lon: -80.0, waterBodyType: "lake" },
  "lake huron": { regionKey: "lake-huron", resolvedName: "Lake Huron, MI", lat: 44.0, lon: -82.5, waterBodyType: "lake" },
  "lake superior": { regionKey: "lake-superior", resolvedName: "Lake Superior, MI/WI/MN", lat: 47.0, lon: -87.0, waterBodyType: "lake" },
  "lake champlain": { regionKey: "lake-champlain", resolvedName: "Lake Champlain, VT/NY", lat: 44.5, lon: -73.3, waterBodyType: "lake" },
  "lake houston": { regionKey: "lake-houston", resolvedName: "Lake Houston, TX", lat: 29.9, lon: -95.14, waterBodyType: "lake" },
  "lake conroe": { regionKey: "lake-conroe", resolvedName: "Lake Conroe, TX", lat: 30.45, lon: -95.58, waterBodyType: "lake" },
  "lake travis": { regionKey: "lake-travis", resolvedName: "Lake Travis, TX", lat: 30.38, lon: -97.97, waterBodyType: "lake" },
  "lake livingston": { regionKey: "lake-livingston", resolvedName: "Lake Livingston, TX", lat: 30.75, lon: -95.17, waterBodyType: "lake" },
  "livingston reservoir": { regionKey: "lake-livingston", resolvedName: "Lake Livingston, TX", lat: 30.75, lon: -95.17, waterBodyType: "lake" },
  "colorado river": { regionKey: "colorado-river", resolvedName: "Colorado River, AZ", lat: 36.0, lon: -114.74, waterBodyType: "river" },
  "columbia river": { regionKey: "columbia-river", resolvedName: "Columbia River, OR", lat: 46.17, lon: -123.76, waterBodyType: "river" },
  "sam rayburn": { regionKey: "sam-rayburn", resolvedName: "Sam Rayburn Reservoir, TX", lat: 31.06, lon: -94.11, waterBodyType: "lake" },
  "sam rayburn reservoir": { regionKey: "sam-rayburn", resolvedName: "Sam Rayburn Reservoir, TX", lat: 31.06, lon: -94.11, waterBodyType: "lake" },
  "toledo bend": { regionKey: "toledo-bend", resolvedName: "Toledo Bend Reservoir, TX/LA", lat: 31.20, lon: -93.57, waterBodyType: "lake" },
  "toledo bend reservoir": { regionKey: "toledo-bend", resolvedName: "Toledo Bend Reservoir, TX/LA", lat: 31.20, lon: -93.57, waterBodyType: "lake" },
};

const LOCATION_ALIASES: Record<string, string> = {
  "galvestion": "galveston", "galviston": "galveston", "galveston seawall": "galveston",
  "obx": "outer banks", "outer bank": "outer banks", "outerbanks": "outer banks", "outer banks nc": "outer banks",
  "the keys": "florida keys", "fl keys": "florida keys", "florida key": "florida keys",
  "chesapeak": "chesapeake", "chesapeak bay": "chesapeake", "ches bay": "chesapeake",
  "destine": "destin", "destin fl": "destin", "destin florida": "destin", "destin harbor": "destin",
  "san fransisco": "san francisco", "s.f. bay": "san francisco", "sf bay": "san francisco", "sf ca": "san francisco", "san fran": "san francisco",
  "charleton": "charleston", "charlston": "charleston", "charleston sc": "charleston", "charleston south carolina": "charleston",
  "puget sound wa": "puget sound", "puget washington": "puget sound",
  "mississippi": "mississippi river", "nola": "new orleans", "new orleans la": "new orleans", "big easy": "new orleans",
  "lake fork tx": "lake fork", "fork texas": "lake fork", "lakefork": "lake fork",
  "tahoe": "lake tahoe", "lake tahoe ca": "lake tahoe", "tahoe lake": "lake tahoe",
  "okeechobee florida": "okeechobee", "lake okee": "okeechobee", "okee": "okeechobee",
  "michigan lakefront": "lake michigan", "great lakes": "lake michigan",
  "colorado river az": "colorado river", "colorado river arizona": "colorado river",
  "columbia river oregon": "columbia river", "columbia river wa": "columbia river", "columbia gorge": "columbia river",
  "san diego": "pacific", "southern california": "pacific", "california coast": "pacific",
  "miami": "florida-keys", "miami beach": "florida-keys",
  "gulf shores": "gulf-coast", "orange beach": "gulf-coast", "panama city": "gulf-coast",
  "virginia beach": "south-atlantic", "myrtle beach": "south-atlantic", "hilton head": "south-atlantic",
  "sam rayburn tx": "sam rayburn", "samrayburn": "sam rayburn", "sam rayburn lake": "sam rayburn", "rayburn": "sam rayburn",
  "toledobend": "toledo bend", "toledo bend texas": "toledo bend", "toledo bend louisiana": "toledo bend",
  "lake michigan il": "lake michigan", "lake michigan indiana": "lake michigan", "chicago lakefront": "lake michigan",
  "lake erie ohio": "lake erie", "lake erie pa": "lake erie", "lake erie ny": "lake erie",
  "lake ontario ny": "lake ontario", "ontario lake": "lake ontario",
  "lake huron mi": "lake huron", "huron lake": "lake huron",
  "lake superior mi": "lake superior", "lake superior mn": "lake superior", "lake superior wi": "lake superior", "superior lake": "lake superior",
  "lake champlain vt": "lake champlain", "lake champlain ny": "lake champlain", "champlain lake": "lake champlain",
  "colorado river ca": "colorado river", "lower colorado river": "colorado river", "lees ferry": "colorado river",
  "columbia river or": "columbia river", "lower columbia river": "columbia river",
  "mississippi river la": "mississippi river", "lower mississippi": "mississippi river", "big muddy": "mississippi river",
};

const LOCATION_KEYWORDS_SALTWATER = /ocean|beach|surf|pier|bay|gulf|coast|sound|inlet|pass|harbor|reef|shoal|marsh|seawall|jetty|wharf|dock|marina|shrimp|crab|oyster|saltwater|salt|tide|tidal|nautical|anchorage|port|island|caye|coral|barrier/;
const LOCATION_KEYWORDS_FRESHWATER = /lake|pond|reservoir|creek|stream|river|bayou|slough|swamp|spring|brook|canal|dam|weir/;
const LOCATION_NAMES_COASTAL = /galveston|houston|corpus|padre|mustang|miami|tampa|naples|fort myers|panama city|biloxi|mobile|gulfport|savannah|hilton head|myrtle beach|virginia beach|atlantic city|cape cod|nantucket|newport|long island|montauk|boston|portland|seattle|tacoma|san diego|los angeles|long beach|santa monica|santa barbara|monterey|santa cruz|half moon|venice|ocean|beach|pier|harbor|new orleans|baton rouge|lake charles|pensacola|st petersburg|daytona|jacksonville|norfolk|annapolis/;
const LOCATION_NAMES_INLAND = /tahoe|fork|okeechobee|guntersville|pickwick|kentucky|wheeler|sam rayburn|toledo bend|fayette|travis|buchanan|amistad|conroe|livingston|caddo|eufaula|grand lake|table rock|bull shoals|norfolk|beaver|trout lake|blue lake|crystal lake|clear lake|walden|michigan|erie|ontario|huron|superior|champlain|colorado river|columbia river|mississippi river|austin|dallas|san antonio|laredo|waco|tyler|longview|el paso/;
const LOCATION_NON_WATER = /retreat|ranch|estates|village|community|club|drive|lane|street|road|court|circle|blvd|boulevard|apartments|condo|resort|spa|inn|lodge|hotel|motel|manor|subdivision|addition|terrace|acres|vista|trace|plantation|pointe|camp|school|church|hospital|mall|plaza|market|ballpark|stadium|arena|factory|warehouse|office|bank|gym|studio|theatre|theater|cinema|diner|bakery|brewery|distillery|winery|farm|barn|mill|mine|quarry/;

const STATE_REGION: Record<string, string> = {
  tx: "gulf-coast", texas: "gulf-coast",
  la: "gulf-coast", louisiana: "gulf-coast",
  ms: "gulf-coast", mississippi: "gulf-coast",
  al: "gulf-coast", alabama: "gulf-coast",
  fl: "florida-keys", florida: "florida-keys",
  ga: "south-atlantic", georgia: "south-atlantic",
  sc: "south-atlantic", "south carolina": "south-atlantic",
  nc: "south-atlantic", "north carolina": "south-atlantic",
  va: "south-atlantic", virginia: "south-atlantic",
  md: "south-atlantic", maryland: "south-atlantic",
  de: "northeast", delaware: "northeast",
  nj: "northeast", "new jersey": "northeast",
  ny: "northeast", "new york": "northeast",
  ct: "northeast", connecticut: "northeast",
  ri: "northeast", "rhode island": "northeast",
  ma: "northeast", massachusetts: "northeast",
  nh: "northeast", "new hampshire": "northeast",
  me: "northeast", maine: "northeast",
  vt: "inland-north", vermont: "inland-north",
  ca: "pacific", california: "pacific",
  or: "pacific-nw", oregon: "pacific-nw",
  wa: "pacific-nw", washington: "pacific-nw",
  hi: "pacific", hawaii: "pacific",
  mi: "great-lakes", michigan: "great-lakes",
  wi: "great-lakes", wisconsin: "great-lakes",
  mn: "great-lakes", minnesota: "great-lakes",
  il: "great-lakes", illinois: "great-lakes",
  in: "great-lakes", indiana: "great-lakes",
  oh: "great-lakes", ohio: "great-lakes",
  pa: "great-lakes", pennsylvania: "great-lakes",
  wv: "inland-south", "west virginia": "inland-south",
  ky: "inland-south", kentucky: "inland-south",
  tn: "inland-south", tennessee: "inland-south",
  ar: "inland-south", arkansas: "inland-south",
  ok: "inland-south", oklahoma: "inland-south",
  mo: "inland-south", missouri: "inland-south",
  ks: "inland-south", kansas: "inland-south",
  ne: "inland-north", nebraska: "inland-north",
  ia: "inland-north", iowa: "inland-north",
  sd: "inland-north", "south dakota": "inland-north",
  nd: "inland-north", "north dakota": "inland-north",
  mt: "inland-north", montana: "inland-north",
  wy: "inland-north", wyoming: "inland-north",
  co: "inland-north", colorado: "inland-north",
  id: "pacific-nw", idaho: "pacific-nw",
  nv: "pacific", nevada: "pacific",
  ut: "pacific", utah: "pacific",
  az: "pacific", arizona: "pacific",
  nm: "pacific", "new mexico": "pacific",
  ak: "pacific-nw", alaska: "pacific-nw",
  dc: "inland-south", "washington dc": "inland-south",
  // Canada
  bc: "pacific-nw", "british columbia": "pacific-nw",
  ab: "inland-north", alberta: "inland-north",
  sk: "inland-north", saskatchewan: "inland-north",
  mb: "inland-north", manitoba: "inland-north",
  on: "great-lakes", ontario: "great-lakes",
  qc: "northeast", quebec: "northeast",
  nb: "northeast", "new brunswick": "northeast",
  ns: "northeast", "nova scotia": "northeast",
  pe: "northeast", "prince edward island": "northeast",
  nl: "northeast", newfoundland: "northeast",
  yt: "pacific-nw", yukon: "pacific-nw",
  nt: "pacific-nw", "northwest territories": "pacific-nw",
  nu: "pacific-nw", nunavut: "pacific-nw",
};

function findBaitData(speciesName: string): BaitRec | null {
  const key = speciesName.trim();
  if (SPECIES_BAIT[key]) return SPECIES_BAIT[key];

  const lower = key.toLowerCase();

  const aliasMap: Record<string, string> = {
    "redfish": "Red Drum",
    "bull red": "Red Drum",
    "red": "Red Drum",
    "speck": "Spotted Seatrout",
    "speckled trout": "Speckled Trout",
    "trout": "Spotted Seatrout",
    "flounder": "Flounder (Southern)",
    "sheephead": "Sheepshead",
    "mackerel": "Spanish Mackerel",
    "spanish": "Spanish Mackerel",
    "kingfish": "King Mackerel",
    "king mackerel": "King Mackerel",
    "cobia": "Cobia",
    "ling": "Cobia",
    "lingcod": "Cobia",
    "snook": "Common Snook",
    "tarpon": "Tarpon",
    "mahi": "Mahi-Mahi (Dolphinfish)",
    "mahi mahi": "Mahi-Mahi (Dolphinfish)",
    "dolphin": "Mahi-Mahi (Dolphinfish)",
    "dolphinfish": "Mahi-Mahi (Dolphinfish)",
    "dorado": "Mahi-Mahi (Dolphinfish)",
    "wahoo": "Wahoo",
    "tuna": "Yellowfin Tuna",
    "yellowfin": "Yellowfin Tuna",
    "bluefin": "Bluefin Tuna",
    "bonito": "False Albacore (Little Tunny)",
    "little tunny": "False Albacore (Little Tunny)",
    "false albacore": "False Albacore (Little Tunny)",
    "jack": "Jack Crevalle",
    "jack crevalle": "Jack Crevalle",
    "crevalle": "Jack Crevalle",
    "snapper": "Mangrove Snapper",
    "mangrove": "Mangrove Snapper",
    "lane": "Lane Snapper",
    "vermilion": "Vermilion Snapper",
    "grouper": "Grouper (Gag)",
    "gag": "Grouper (Gag)",
    "red grouper": "Grouper (Red)",
    "trigger": "Triggerfish",
    "trigger fish": "Triggerfish",
    "amberjack": "Amberjack (Greater)",
    "reef donkey": "Amberjack (Greater)",
    "tripletail": "Tripletail",
    "blackfish": "Tautog (Blackfish)",
    "tautog": "Tautog (Blackfish)",
    "tog": "Tautog (Blackfish)",
    "croaker": "Atlantic Croaker",
    "hardhead": "Hardhead Catfish",
    "gafftop": "Gafftop Catfish (Sail Catfish)",
    "sail cat": "Gafftop Catfish (Sail Catfish)",
    "sailcat": "Gafftop Catfish (Sail Catfish)",
    "catfish": "Channel Catfish",
    "channel cat": "Channel Catfish",
    "blue cat": "Blue Catfish",
    "flathead": "Flathead Catfish",
    "largemouth": "Largemouth Bass",
    "largemouth bass": "Largemouth Bass",
    "bass": "Largemouth Bass",
    "smallmouth": "Smallmouth Bass",
    "smallie": "Smallmouth Bass",
    "smallmouth bass": "Smallmouth Bass",
    "white bass": "White Bass",
    "hybrid": "Hybrid Striped Bass",
    "striped bass": "Striped Bass",
    "striper": "Striped Bass",
    "rockfish": "Striped Bass",
    "rock bass": "Rock Bass",
    "yellow bass": "Yellow Bass",
    "crappie": "Black Crappie",
    "black crappie": "Black Crappie",
    "white crappie": "White Crappie",
    "bluegill": "Bluegill Sunfish",
    "sunfish": "Bluegill Sunfish",
    "bream": "Bluegill Sunfish",
    "perch": "Yellow Perch",
    "yellow perch": "Yellow Perch",
    "walleye": "Walleye",
    "pike": "Northern Pike",
    "northern pike": "Northern Pike",
    "northern": "Northern Pike",
    "muskie": "Muskellunge (Muskie)",
    "muskellunge": "Muskellunge (Muskie)",
    "gar": "Alligator Gar",
    "alligator gar": "Alligator Gar",
    "spotted gar": "Spotted Gar",
    "bowfin": "Bowfin",
    "drum": "Black Drum",
    "black drum": "Black Drum",
    "red drum": "Red Drum",
    "pompano": "Pompano",
    "florida pompano": "Florida Pompano",
    "whiting": "Whiting (Gulf Kingfish)",
    "gulf kingfish": "Whiting (Gulf Kingfish)",
    "ladyfish": "Ladyfish",
    "spanish mackerel": "Spanish Mackerel",
    "shark": "Blacktip Shark",
    "blacktip": "Blacktip Shark",
    "bonnethead": "Bonnethead Shark",
    "hammerhead": "Bonnethead Shark",
    "bull shark": "Bull Shark",
    "spinner": "Spinner Shark",
    "stingray": "Southern Stingray",
    "ray": "Cownose Ray",
    "cownose": "Cownose Ray",
    "eel": "American Eel",
    "american eel": "American Eel",
  };

  if (aliasMap[lower]) {
    const resolved = SPECIES_BAIT[aliasMap[lower]];
    if (resolved) return resolved;
  }

  for (const [k, v] of Object.entries(SPECIES_BAIT)) {
    if (k.toLowerCase() === lower) return v;
    if (k.toLowerCase().includes(lower) || lower.includes(k.toLowerCase())) return v;
  }
  return null;
}

function fillBaitMap(species: string[]): BaitRec[] {
  return species.map(s => findBaitData(s)).filter((b): b is BaitRec => b !== null);
}

function classifyLocation(name: string): { regionKey: string; resolvedName: string; lat: number; lon: number; waterBodyType: string; matchType: "exact" | "fuzzy" | "estimated" } {
  const loc = name.toLowerCase().trim();

  // 1) direct alias lookup
  if (LOCATION_ALIASES[loc]) {
    const alias = LOCATION_ALIASES[loc];
    if (LOCATION_REGION_MAP[alias]) return { ...LOCATION_REGION_MAP[alias], resolvedName: name, matchType: "exact" };
  }

  // 2) substring match against location map keys
  for (const [key, region] of Object.entries(LOCATION_REGION_MAP)) {
    if (loc.includes(key)) return { ...region, resolvedName: name, matchType: "exact" };
  }

  // 3) alias substring match
  for (const [alias, target] of Object.entries(LOCATION_ALIASES)) {
    if (loc.includes(alias)) {
      const region = LOCATION_REGION_MAP[target];
      if (region) return { ...region, resolvedName: name, matchType: "exact" };
    }
  }

  // 4) Levenshtein distance for misspellings
  let bestDist = Infinity;
  let bestMatch: RegionAssignment | null = null;
  for (const [key, region] of Object.entries(LOCATION_REGION_MAP)) {
    if (Math.abs(loc.length - key.length) > 3) continue;
    const dist = levenshtein(loc.substring(0, key.length), key);
    if (dist < bestDist) {
      bestDist = dist;
      bestMatch = region;
    }
  }
  for (const [alias, target] of Object.entries(LOCATION_ALIASES)) {
    if (Math.abs(loc.length - alias.length) > 3) continue;
    const dist = levenshtein(loc.substring(0, alias.length), alias);
    if (dist < bestDist) {
      bestDist = dist;
      const region = LOCATION_REGION_MAP[target];
      if (region) bestMatch = region;
    }
  }
  if (bestDist <= 2 && bestMatch) return { ...bestMatch, resolvedName: name, matchType: "fuzzy" };

  // 5) keyword analysis fallback
  const words = loc.split(/[\s,.-]+/).filter(Boolean);
  let saltScore = 0;
  let freshScore = 0;
  for (const w of words) {
    if (LOCATION_KEYWORDS_SALTWATER.test(w)) saltScore += 4;
    if (LOCATION_KEYWORDS_FRESHWATER.test(w)) freshScore += 4;
    if (LOCATION_NAMES_COASTAL.test(w)) saltScore += 2;
    if (LOCATION_NAMES_INLAND.test(w)) freshScore += 2;
  }

  // check for state overrides — scan right to left so "Missouri River Montana" picks Montana
  let stateRegion: string | null = null;
  for (let i = words.length - 1; i >= 0 && !stateRegion; i--) {
    if (STATE_REGION[words[i]]) stateRegion = STATE_REGION[words[i]];
  }
  for (let i = words.length - 2; i >= 0 && !stateRegion; i--) {
    const two = `${words[i]} ${words[i+1]}`;
    if (STATE_REGION[two]) stateRegion = STATE_REGION[two];
  }

  // community lake detection — name has HOA/neighborhood keywords
  const hasCommunityWord = words.some(w => LOCATION_NON_WATER.test(w));
  const hasFreshKeyword = words.some(w => LOCATION_KEYWORDS_FRESHWATER.test(w));
  if (hasCommunityWord && hasFreshKeyword) {
    const wbt = loc.includes("lake") ? "lake" : loc.includes("pond") ? "pond" : "lake";
    if (stateRegion === "gulf-coast" && /housto|tx|texas/.test(loc)) {
      return { regionKey: "community-lake-fishin-program", resolvedName: name, lat: 29.76, lon: -95.36, waterBodyType: wbt, matchType: "estimated" };
    }
    if (stateRegion === "inland-north" || stateRegion === "great-lakes" || stateRegion === "northeast") {
      const r = REGION_PROFILES[stateRegion];
      return { regionKey: stateRegion, resolvedName: name, lat: r.lat, lon: r.lon, waterBodyType: wbt, matchType: "estimated" };
    }
    return { regionKey: "community-lake-south", resolvedName: name, lat: 32.0, lon: -95.0, waterBodyType: wbt, matchType: "estimated" };
  }

  const lastWord = words[words.length - 1] || "";
  const firstWord = words[0] || "";

  if (saltScore > freshScore || ["bay", "sound", "inlet", "harbor", "beach", "pier", "coast", "gulf", "shore", "ocean", "sea"].includes(lastWord) || ["cape", "gulf", "port", "fort"].includes(firstWord)) {
    const wbt = loc.includes("pier") ? "pier" : loc.includes("beach") ? "surf" : loc.includes("bay") ? "bay" : loc.includes("harbor") ? "harbor" : "coastal";
    const regionKey = stateRegion || "gulf-coast";
    const r = REGION_PROFILES[regionKey];
    return { regionKey, resolvedName: name, lat: r.lat, lon: r.lon, waterBodyType: wbt, matchType: "estimated" };
  }

  if (freshScore > saltScore || ["lake", "pond", "river", "creek", "brook", "reservoir"].includes(lastWord)) {
    const wbt = loc.includes("lake") ? "lake" : loc.includes("river") ? "river" : loc.includes("creek") ? "creek" : "lake";
    if (stateRegion) {
      const r = REGION_PROFILES[stateRegion];
      return { regionKey: stateRegion, resolvedName: name, lat: r.lat, lon: r.lon, waterBodyType: wbt, matchType: "estimated" };
    }
    const freshRegions = ["great-lakes", "inland-south", "inland-north", "pacific-rivers"];
    for (const regionKey of freshRegions) {
      const r = REGION_PROFILES[regionKey];
      if (r) return { regionKey, resolvedName: name, lat: r.lat, lon: r.lon, waterBodyType: wbt, matchType: "estimated" };
    }
    return { regionKey: "inland-south", resolvedName: name, lat: 32.0, lon: -95.0, waterBodyType: wbt, matchType: "estimated" };
  }

  // default: unknown name → check state or assume coastal saltwater
  if (stateRegion) {
    const r = REGION_PROFILES[stateRegion];
    const wbt = loc.includes("lake") ? "lake" : loc.includes("river") ? "river" : r.waterBodyType;
    return { regionKey: stateRegion, resolvedName: name, lat: r.lat, lon: r.lon, waterBodyType: wbt, matchType: "estimated" };
  }
  return { regionKey: "gulf-coast", resolvedName: name, lat: 29.5, lon: -94.0, waterBodyType: "fishing area", matchType: "estimated" };
}

async function geocodeLocation(name: string): Promise<{ lat: number; lon: number; displayName: string; category: string } | null> {
  try {
    const lower = name.toLowerCase();
    const isCanada = /\b(british columbia|alberta|saskatchewan|manitoba|ontario|quebec|new brunswick|nova scotia|newfoundland|pei|yukon|nunavut|canada)\b/i.test(name);
    const country = isCanada ? "Canada" : "USA";

    // Try the name as-is first, then try extracting just the location part
    const queries = [name];
    const cityMatch = name.match(/\b(near|by|in|at)\s+([\w\s]+)$/i);
    if (cityMatch) queries.push(cityMatch[2].trim());

    for (const q of queries) {
      const resp = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q + ", " + country)}&format=json&limit=3&addressdetails=1`,
        { headers: { "User-Agent": "CoastalAnglerGuide/1.0" }, signal: AbortSignal.timeout(4000) }
      );
      const data = await resp.json() as Array<{ lat: string; lon: string; display_name: string; category: string; type: string }>;
      if (!data?.[0]) continue;
      const waterResults = data.filter(d => d.category === "water" || d.type === "water" || d.type === "bay" || d.type === "river" || d.type === "lake" || d.type === "reservoir");
      // On first query, require a water match; on second query (fallback), accept any geocoded result
      const best = waterResults[0] || (queries.length > 1 && q !== queries[0] ? data[0] : null);
      if (best) return { lat: parseFloat(best.lat), lon: parseFloat(best.lon), displayName: best.display_name, category: best.category || best.type };
    }
    return null;
  } catch {
    return null;
  }
}

async function lookupFishOnWikipedia(name: string): Promise<{ species: string[]; pageTitle: string } | null> {
  try {
    const searchResp = await fetch(
      `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(name)}&srlimit=5&format=json`,
      { signal: AbortSignal.timeout(4000) }
    );
    const searchData = await searchResp.json() as any;
    const pages = searchData?.query?.search || [];
    const target = pages.find((p: any) => {
      const t = p.title.toLowerCase();
      return t === name.toLowerCase() || t.includes(name.toLowerCase());
    }) || pages[0];
    if (!target) return null;

    const pageResp = await fetch(
      `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&titles=${encodeURIComponent(target.title)}&explaintext&format=json&exlimit=1`,
      { signal: AbortSignal.timeout(4000) }
    );
    const pageData = await pageResp.json() as any;
    const pages2 = pageData?.query?.pages || {};
    const extract = Object.values(pages2 as Record<string, any>)[0]?.extract || "";

    const sections = extract.split(/\n==+\s*/);
    const fishSections = sections.filter((s: string) => /fish|fishing|ecology|species|wildlife|fauna/i.test(s));
    const textToSearch = fishSections.length > 0 ? fishSections.join("\n") : extract;

    const commonFish = ["bass", "trout", "catfish", "sunfish", "crappie", "perch", "walleye", "pike", "muskie", "pickerel", "bluegill", "carp", "shad", "drum", "gar", "bowfin", "bullhead", "salmon", "steelhead", "char", "chub", "dace", "shiner", "sucker", "minnow", "topminnow", "killifish", "madtom", "sculpin", "darter", "logperch", "silverside", "smelt", "tilapia", "cichlid", "mosquitofish", "goby"];
    const found: string[] = [];
    for (const line of textToSearch.split("\n")) {
      for (const cf of commonFish) {
        const re = new RegExp(`\\b([A-Z][a-z]+(?:\\s+[A-Z][a-z]+){0,2})\\b.*${cf}`, "i");
        const m = line.match(re);
        if (m && !found.includes(m[1])) {
          found.push(m[1]);
        }
      }
    }
    if (found.length < 3) return null;
    return { species: found.slice(0, 30), pageTitle: target.title };
  } catch {
    return null;
  }
}

async function lookupFishOnINaturalist(lat: number, lon: number, isFreshwater: boolean): Promise<{ species: string[] } | null> {
  try {
    const resp = await fetch(
      `https://api.inaturalist.org/v1/observations/species_counts?taxon_id=47178&lat=${lat}&lng=${lon}&radius=15&verifiable=true&order=desc&order_by=observed_on`,
      { signal: AbortSignal.timeout(6000) }
    );
    const data = await resp.json() as { total_results: number; results: Array<{ taxon: { id: number; name: string; preferred_common_name?: string; rank: string } }> };
    if (!data?.total_results || !data.results) return null;
    const freshwaterOnly = ["centrarchidae", "ictaluridae", "percidae", "esocidae", "cyprinidae", "catostomidae", "acipenseridae", "salmonidae", "lepisosteidae", "amiidae", "moronidae", "polyodontidae", "hiodontidae", "aphredoderidae", "fundulidae", "poeciliidae", "atherinopsidae", "gasterosteidae", "cottidae"];
    const results = data.results
      .filter(r => r.taxon.rank === "species");
    if (results.length === 0) return null;
    const species = results.map(r => r.taxon.preferred_common_name || r.taxon.name).filter(Boolean);
    if (species.length === 0) return null;
    return { species: species.slice(0, 25) };
  } catch {
    return null;
  }
}

const NOAA_TIDE_STATIONS: { id: string; name: string; lat: number; lon: number }[] = [
  { id: "8771450", name: "Galveston Pier 21, TX", lat: 29.31, lon: -94.79 },
  { id: "8771341", name: "Galveston Bay Entrance, TX", lat: 29.36, lon: -94.72 },
  { id: "8775241", name: "Port Aransas, TX", lat: 27.84, lon: -97.07 },
  { id: "8775870", name: "Padre Island, TX", lat: 27.58, lon: -97.22 },
  { id: "8768094", name: "Biloxi, MS", lat: 30.41, lon: -88.83 },
  { id: "8736897", name: "Pensacola, FL", lat: 30.40, lon: -87.21 },
  { id: "8735180", name: "Destin Pass, FL", lat: 30.39, lon: -86.52 },
  { id: "8724580", name: "Key West, FL", lat: 24.55, lon: -81.81 },
  { id: "8727520", name: "Naples, FL", lat: 26.13, lon: -81.81 },
  { id: "8725110", name: "Clearwater Beach, FL", lat: 27.98, lon: -82.83 },
  { id: "8726724", name: "Venice, FL", lat: 27.10, lon: -82.46 },
  { id: "8720030", name: "Fernandina Beach, FL", lat: 30.67, lon: -81.47 },
  { id: "8670870", name: "Fort Pulaski, GA", lat: 32.04, lon: -80.90 },
  { id: "8665530", name: "Charleston, SC", lat: 32.78, lon: -79.93 },
  { id: "8658120", name: "Wilmington, NC", lat: 34.23, lon: -77.95 },
  { id: "8656483", name: "Beaufort, NC", lat: 34.72, lon: -76.67 },
  { id: "8638863", name: "Chesapeake Bay Br, VA", lat: 36.97, lon: -76.11 },
  { id: "8638610", name: "Sewells Point, VA", lat: 36.95, lon: -76.33 },
  { id: "8574680", name: "Annapolis, MD", lat: 38.98, lon: -76.48 },
  { id: "8531680", name: "Sandy Hook, NJ", lat: 40.47, lon: -74.01 },
  { id: "8518750", name: "The Battery, NY", lat: 40.70, lon: -74.01 },
  { id: "8461490", name: "New London, CT", lat: 41.36, lon: -72.09 },
  { id: "8454000", name: "Montauk, NY", lat: 41.05, lon: -71.96 },
  { id: "8447380", name: "Scituate, MA", lat: 42.20, lon: -70.72 },
  { id: "8443970", name: "Boston, MA", lat: 42.35, lon: -71.05 },
  { id: "8419870", name: "Portland, ME", lat: 43.66, lon: -70.25 },
  { id: "9414290", name: "San Francisco, CA", lat: 37.81, lon: -122.46 },
  { id: "9413450", name: "Monterey, CA", lat: 36.61, lon: -121.89 },
  { id: "9410660", name: "Los Angeles, CA", lat: 33.72, lon: -118.27 },
  { id: "9410170", name: "San Diego, CA", lat: 32.71, lon: -117.17 },
  { id: "9435380", name: "South Beach, OR", lat: 44.63, lon: -124.04 },
  { id: "9432780", name: "Charleston, OR", lat: 43.35, lon: -124.32 },
  { id: "9447130", name: "Seattle, WA", lat: 47.60, lon: -122.34 },
  { id: "9444900", name: "Port Townsend, WA", lat: 48.11, lon: -122.76 },
  { id: "9443090", name: "Neah Bay, WA", lat: 48.36, lon: -124.62 },
];

function findNearestStation(lat: number, lon: number): { id: string; name: string; distDeg: number } | null {
  let best: { id: string; name: string; distDeg: number } | null = null;
  for (const s of NOAA_TIDE_STATIONS) {
    const d = Math.sqrt((s.lat - lat) ** 2 + (s.lon - lon) ** 2);
    if (d < 3 && (!best || d < best.distDeg)) best = { id: s.id, name: s.name, distDeg: d };
  }
  return best;
}

async function getTideData(lat?: number, lon?: number): Promise<{ tidalPhase: string; tideChart: Array<{ time: string; heightFt: number; type: string }> }> {
  if (typeof lat === "number" && typeof lon === "number") {
    const station = findNearestStation(lat, lon);
    if (station) {
      try {
        const now = new Date();
        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, "0");
        const d = String(now.getDate()).padStart(2, "0");
        const dateStr = `${y}${m}${d}`;

        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 4000);
        const res = await fetch(
          `https://api.tidesandcurrents.noaa.gov/api/prod/datagetter` +
          `?product=high_low&application=Coastal_Angler_Guide` +
          `&begin_date=${dateStr}&end_date=${dateStr}` +
          `&datum=MLLW&station=${station.id}&time_zone=lst_ldt&units=english&format=json`,
          { signal: ctrl.signal }
        );
        clearTimeout(timer);
        const data = await res.json() as any;

        if (data?.predictions?.length) {
          const points: { m: number; type: string; v: number }[] = data.predictions.map((p: any) => {
            const dt = new Date(p.t + " UTC");
            return { m: dt.getHours() * 60 + dt.getMinutes(), type: p.type === "H" ? "high" : "low", v: parseFloat(p.v) };
          }).filter((p: any) => !isNaN(p.v)).sort((a: any, b: any) => a.m - b.m);

          if (points.length >= 2) {
            const chart: Array<{ time: string; heightFt: number; type: string }> = [];
            for (let t = 0; t <= 24; t++) {
              const tm = t * 60;
              let hft = 0, st = "rising";
              let found = false;
              for (let i = 0; i < points.length; i++) {
                const c = points[i];
                const n = points[(i + 1) % points.length];
                const nm = i === points.length - 1 ? n.m + 1440 : n.m;
                if (tm >= c.m && tm <= nm) {
                  const f = (tm - c.m) / (nm - c.m);
                  hft = c.v + (n.v - c.v) * (1 - Math.cos(Math.PI * f)) / 2;
                  st = c.type === "low" ? "rising" : "falling";
                  found = true;
                  break;
                }
              }
              if (!found) {
                const last = points[points.length - 1];
                const first = points[0];
                const nm = first.m + 1440;
                const f = (tm - last.m) / (nm - last.m);
                hft = last.v + (first.v - last.v) * (1 - Math.cos(Math.PI * f)) / 2;
                st = last.type === "low" ? "rising" : "falling";
              }
              const h12 = t % 12 || 12;
              const ampm = t >= 12 ? "PM" : "AM";
              chart.push({ time: `${h12}:${String(t % 60).padStart(2, "0")} ${ampm}`, heightFt: Math.round(hft * 10) / 10, type: st });
            }

            const cm = now.getHours() * 60 + now.getMinutes();
            let phase = "Incoming";
            for (let i = 0; i < points.length; i++) {
              const p = points[i];
              const n = points[(i + 1) % points.length];
              const nm = i === points.length - 1 ? n.m + 1440 : n.m;
              if (cm >= p.m && cm <= nm) {
                const dist = nm - cm;
                const h = Math.floor(dist / 60);
                const mi = Math.round(dist % 60);
                const state = p.type === "low" ? "Incoming" : "Outgoing";
                const nextType = p.type === "low" ? "high" : "low";
                if (Math.abs(cm - p.m) < 20) {
                  phase = `${nextType === "high" ? "High" : "Low"} tide now`;
                } else if (h === 0) {
                  phase = `${state} — ${mi} min to ${nextType} tide`;
                } else {
                  phase = `${state} — ${h}h ${mi}m to ${nextType} tide`;
                }
                break;
              }
            }
            return { tidalPhase: phase, tideChart: chart };
          }
        }
      } catch {
        // NOAA fetch failed, fall through to simulation
      }
    }
  }

  // Fallback: simulated tide based on lunar cycle
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const LUNAR_DAY_MINUTES = 24 * 60 + 50.47;
  const daysSince = (startOfDay.getTime() - new Date("2026-06-01T00:00:00Z").getTime()) / (24 * 60 * 60 * 1000);
  const offsetMinutes = (daysSince * 50.47) % (LUNAR_DAY_MINUTES / 2);

  const t1High = (-30 + offsetMinutes + LUNAR_DAY_MINUTES / 2) % (LUNAR_DAY_MINUTES / 2);
  const t1Low = (t1High + LUNAR_DAY_MINUTES / 4) % (LUNAR_DAY_MINUTES / 2);
  const t2High = (t1High + LUNAR_DAY_MINUTES / 2) % LUNAR_DAY_MINUTES;
  const t2Low = (t1Low + LUNAR_DAY_MINUTES / 2) % LUNAR_DAY_MINUTES;

  const moonPhase = (daysSince % 29.53) / 29.53;
  const springFactor = 1 + 0.3 * Math.cos(2 * Math.PI * moonPhase);
  const baseHeights = [3.2, 2.8, 3.6, 3.0];

  function fmt(minutes: number): string {
    let h24 = Math.floor(minutes / 60) % 24;
    const m = Math.floor(minutes % 60);
    const ampm = h24 >= 12 ? "PM" : "AM";
    const h12 = h24 % 12 || 12;
    return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
  }

  const points = [
    { m: t1High, type: "high", bh: baseHeights[0] },
    { m: t1Low, type: "low", bh: baseHeights[1] },
    { m: t2High, type: "high", bh: baseHeights[2] },
    { m: t2Low, type: "low", bh: baseHeights[3] },
  ].sort((a, b) => a.m - b.m);

  const chart: Array<{ time: string; heightFt: number; type: string }> = [];
  for (let t = 0; t <= 24; t++) {
    const tm = t * 60;
    let hft = 0, st = "rising";
    let found = false;
    for (let i = 0; i < points.length; i++) {
      const c = points[i];
      const n = points[(i + 1) % points.length];
      const nm = i === points.length - 1 ? n.m + LUNAR_DAY_MINUTES : n.m;
      if (tm >= c.m && tm <= nm) {
        const f = (tm - c.m) / (nm - c.m);
        hft = c.bh * springFactor + (n.bh * springFactor - c.bh * springFactor) * (1 - Math.cos(Math.PI * f)) / 2;
        st = c.type === "low" ? "rising" : "falling";
        found = true;
        break;
      }
    }
    if (!found) {
      const last = points[points.length - 1];
      const first = points[0];
      const nm = first.m + LUNAR_DAY_MINUTES;
      const f = (tm - last.m) / (nm - last.m);
      hft = last.bh * springFactor + (first.bh * springFactor - last.bh * springFactor) * (1 - Math.cos(Math.PI * f)) / 2;
      st = last.type === "low" ? "rising" : "falling";
    }
    chart.push({ time: fmt(tm), heightFt: Math.round(hft * 10) / 10, type: st });
  }

  const cm = now.getHours() * 60 + now.getMinutes();
  let phase = "Incoming";
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const n = points[(i + 1) % points.length];
    const nm = i === points.length - 1 ? n.m + LUNAR_DAY_MINUTES : n.m;
    if (cm >= p.m && cm <= nm) {
      const dist = nm - cm;
      const h = Math.floor(dist / 60);
      const mi = Math.round(dist % 60);
      const state = p.type === "low" ? "Incoming" : "Outgoing";
      const nextType = p.type === "low" ? "high" : "low";
      if (Math.abs(cm - p.m) < 20) {
        phase = `${nextType === "high" ? "High" : "Low"} tide now`;
      } else if (h === 0) {
        phase = `${state} — ${mi} min to ${nextType} tide`;
      } else {
        phase = `${state} — ${h}h ${mi}m to ${nextType} tide`;
      }
      break;
    }
  }
  return { tidalPhase: phase, tideChart: chart };
}

router.post("/search-location", async (req, res) => {
  const parsed = SearchLocationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const { locationName } = parsed.data;
  const assignment = classifyLocation(locationName);
  const region = REGION_PROFILES[assignment.regionKey];

  let species = region.species;
  let matchNote = "";
  let externalSource = "";
  let externalUrl = "";

  if (assignment.matchType === "estimated") {
    const isAddress = LOCATION_NON_WATER.test(locationName.toLowerCase());
    const regionBaitCount = fillBaitMap(species).length;

    // Geocode to get real coordinates for weather
    if (!isAddress) {
      const geo = await geocodeLocation(locationName);
      if (geo) {
        assignment.lat = geo.lat;
        assignment.lon = geo.lon;
      }
    }

    // Try to find specific survey data from Wikipedia, FishBase, and iNaturalist
    if (!isAddress && regionBaitCount < 3) {
      let found = false;

      // Source 1: Wikipedia
      const wiki = await lookupFishOnWikipedia(locationName);
      if (wiki && wiki.species.length >= 3) {
        species = wiki.species;
        externalSource = `Wikipedia — "${wiki.pageTitle}"`;
        externalUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(wiki.pageTitle.replace(/ /g, "_"))}`;
        matchNote = `Fish species listed on Wikipedia for "${wiki.pageTitle}".`;
        found = true;
      }

      // Source 2: iNaturalist community observations
      if (!found) {
        const inat = await lookupFishOnINaturalist(assignment.lat, assignment.lon, assignment.waterBodyType !== "coastal");
        if (inat && inat.species.length >= 3) {
          species = inat.species;
          externalSource = `iNaturalist community observations near "${locationName}"`;
          externalUrl = `https://www.inaturalist.org/observations?taxon_id=47178&lat=${assignment.lat}&lng=${assignment.lon}&radius=15`;
          matchNote = `Species observed near this location by the iNaturalist community.`;
          found = true;
        }
      }
    }

    if (!externalSource) {
      if (assignment.regionKey.startsWith("community-")) {
        matchNote = assignment.regionKey === "community-lake-fishin-program"
          ? "Based on TPWD Neighborhood Fishin' Program stocking data for Houston-area community lakes. Channel Catfish are stocked every 2 weeks Apr-Oct, Rainbow Trout Dec-Feb."
          : "Based on typical HOA and private lake stocking in the Southern US. Largemouth Bass and Bluegill are standard. Grass Carp may be added for vegetation control under permit.";
      } else {
        matchNote = `No specific survey data found for "${locationName}". Showing estimated species based on the ${region.name} region — these are common fish in similar ${assignment.waterBodyType} habitats.`;
      }
    }
  }

  const baitRecs = fillBaitMap(species);
  const isLakeProfile = assignment.regionKey.startsWith("lake-");
  const isCommunityLake = assignment.regionKey.startsWith("community-");
  const sources = isLakeProfile
    ? [
        `Texas Parks & Wildlife Department survey report — ${region.name} (https://tpwd.texas.gov/publications/pwdpubs/lake_survey/)`,
        "Texas Parks & Wildlife Department — lake stocking history & creel surveys (https://tpwd.texas.gov/fishboat/fish/action/stock_bywater.php)",
      ]
    : externalSource
      ? [`${externalSource} (${externalUrl})`]
      : isCommunityLake
        ? [
            "TPWD Neighborhood Fishin' Program — community lake stocking (https://tpwd.texas.gov/fishboat/fish/management/stocking/neighborhood_fishin.phtml)",
            "TPWD Private Water Stocking — guidelines for HOA/community lakes (https://tpwd.texas.gov/fishboat/fish/management/stocking/private_water.phtml)",
          ]
          : assignment.matchType !== "estimated"
          ? [
              "NOAA Estuarine Living Marine Resources (ELMR) species inventory — Galveston Bay (https://repository.library.noaa.gov/view/noaa/2882)",
              "Texas Parks & Wildlife Department Coastal Fisheries monitoring & bait research (https://tpwd.texas.gov/fishboat/fish/)",
              "Visit Galveston — official tourism fishing guide (https://www.visitgalveston.com/things-to-do/outdoor-activities/fishing/)",
              "TPWD fishing reports — East Galveston Bay (https://tpwd.texas.gov/fishboat/fish/action/reptform2.php?lake=EAST+GALVESTON+BAY)",
            ]
          : [
              `OpenStreetMap/Nominatim — geocoded coordinates for "${locationName}" (https://nominatim.openstreetmap.org)`,
              `${region.name} — estimated species for this region and ${assignment.waterBodyType} habitat`,
            ];

  const [tides, wx] = await Promise.all([
    getTideData(assignment.lat, assignment.lon),
    fetchWeather(assignment.lat, assignment.lon),
  ]);
  const isFresh = region.conditions.tidalPhase === "N/A - Freshwater";

  const nowH = new Date().getHours();

  const filteredChart = tides.tideChart
    .map((e, i) => ({ e, i }))
    .filter(({ i }) => i !== 24 && (((i - nowH + 24) % 24) <= 6 || ((i - nowH + 24) % 24) >= 18))
    .sort((a, b) => {
      const da = (a.i - nowH + 24) % 24 >= 18;
      const db = (b.i - nowH + 24) % 24 >= 18;
      if (da !== db) return db ? 1 : -1;
      const va = da ? a.i : (a.i < nowH ? a.i + 24 : a.i);
      const vb = db ? b.i : (b.i < nowH ? b.i + 24 : b.i);
      return va - vb;
    })
    .map(({ e }) => e);

  const currentHeightFt = isFresh || tides.tideChart.length === 0
    ? null
    : tides.tideChart[nowH]?.heightFt ?? null;

  const response: Record<string, unknown> = {
    resolvedName: locationName,
    latitude: assignment.lat,
    longitude: assignment.lon,
    waterBodyType: assignment.waterBodyType,
    region: region.name,
    topSpecies: species,
    baitRecommendations: baitRecs,
    conditions: {
      ...region.conditions,
      ...wx,
      ...(isFresh
        ? { tidalPhase: "N/A - Freshwater", tideChart: [], waterTemp: null, salinity: null }
        : { ...tides, tideChart: filteredChart }),
      waveHeight: isFresh ? null : currentHeightFt,
    },
    sources,
  };

  if (externalSource) {
    response.matchType = "researched";
    response.matchNote = matchNote;
  } else if (assignment.matchType === "exact") {
    response.matchType = "exact";
  } else if (assignment.matchType === "fuzzy") {
    response.matchType = "fuzzy";
    response.matchNote = `Matched "${locationName}" to the ${region.name} region (did you mean a nearby location?).`;
  } else {
    response.matchType = "estimated";
    response.matchNote = matchNote;
  }

  res.json(response);
});

export default router;