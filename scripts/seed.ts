/**
 * NutriSLM seed script.
 * Seeds: canonical food database (IFCT2017/USDA-referenced values per reference unit),
 * multilingual + romanized aliases, RAG evidence corpus (public health guidance),
 * configurable disease constraints, meal templates, demo user.
 *
 * Run: bun run scripts/seed.ts
 */
import { PrismaClient } from "@prisma/client";
import { scryptSync, randomBytes } from "crypto";
import { normalizeKey } from "../src/lib/nutrition/normalize";

const db = new PrismaClient();

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}

type FoodSeed = {
  id: string;
  name: string;
  category: string;
  veg: boolean;
  egg?: boolean;
  serving: string; // "1 piece" | "100 g" | "1 katori" | "1 glass" ...
  cal: number; p: number; c: number; f: number; fb: number;
  sugar?: number; na?: number; k?: number; ph?: number; chol?: number; sat?: number;
  source?: string;
  tags: string[];
  allergens?: string[];
  aliases: [string, string, boolean?][]; // [alias, language, isPrimary]
};

const FOODS: FoodSeed[] = [
  {
    id: "IDLI", name: "Idli", category: "dish", veg: true, serving: "1 piece",
    cal: 65, p: 2.2, c: 12.5, f: 0.4, fb: 0.6, na: 65,
    tags: ["breakfast", "fermented", "steamed", "south_indian"], allergens: [],
    aliases: [
      ["Idli", "en", true], ["Idly", "en"], ["இட்லி", "ta"], ["ఇడ్లీ", "te"], ["ಇಡ್ಲಿ", "kn"], ["इडली", "hi"],
      ["idli", "rom", true], ["idly", "rom"],
    ],
  },
  {
    id: "SAMBAR", name: "Sambar", category: "dish", veg: true, serving: "1 katori",
    cal: 87, p: 4.2, c: 12.0, f: 2.4, fb: 3.2, na: 180, k: 250, ph: 90,
    tags: ["lunch", "dinner", "legume", "vegetable", "south_indian", "high_fiber"], allergens: [],
    aliases: [
      ["Sambar", "en", true], ["Sambhar", "en"], ["சாம்பார்", "ta"], ["సాంబార్", "te"], ["ಸಾಂಬಾರ್", "kn"], ["सांभर", "hi"],
      ["sambar", "rom", true], ["sambhar", "rom"], ["saambar", "rom"],
    ],
  },
  {
    id: "DOSA", name: "Dosa", category: "dish", veg: true, serving: "1 piece",
    cal: 133, p: 3.2, c: 22.0, f: 3.7, fb: 1.1, na: 110,
    tags: ["breakfast", "fermented", "south_indian"], allergens: [],
    aliases: [
      ["Dosa", "en", true], ["Dosai", "en"], ["தோசை", "ta"], ["దోస", "te"], ["ದೋಸೆ", "kn"], ["डोसा", "hi"],
      ["dosa", "rom", true], ["dosai", "rom"],
    ],
  },
  {
    id: "MASALA_DOSA", name: "Masala Dosa", category: "dish", veg: true, serving: "1 piece",
    cal: 250, p: 5.0, c: 38.0, f: 8.0, fb: 2.5, na: 180,
    tags: ["breakfast", "fermented", "south_indian"], allergens: ["dairy"],
    aliases: [
      ["Masala Dosa", "en", true], ["Masala Dosai", "en"], ["மசாலா தோசை", "ta"], ["మసాలా దోస", "te"],
      ["masala dosa", "rom", true], ["masala dosai", "rom"],
    ],
  },
  {
    id: "ROTIP", name: "Roti (Chapati)", category: "dish", veg: true, serving: "1 piece",
    cal: 104, p: 3.4, c: 20.0, f: 1.2, fb: 2.6, na: 75, ph: 80,
    tags: ["lunch", "dinner", "whole_grain", "north_indian"], allergens: ["gluten"],
    aliases: [
      ["Roti", "en", true], ["Chapati", "en"], ["Phulka", "en"], ["రొట్టె", "te"], ["ರೊಟ್ಟಿ", "kn"], ["रोटी", "hi"],
      ["roti", "rom", true], ["chapati", "rom"], ["chapathi", "rom"], ["phulka", "rom"],
    ],
  },
  {
    id: "RICE_C", name: "Rice (cooked)", category: "grain", veg: true, serving: "1 katori",
    cal: 195, p: 4.0, c: 44.0, f: 0.4, fb: 0.6, na: 5, ph: 50,
    tags: ["lunch", "dinner", "south_indian"], allergens: [],
    aliases: [
      ["Rice", "en", true], ["Cooked Rice", "en"], ["Steamed Rice", "en"], ["சாதம்", "ta"], ["అన్నం", "te"], ["ಅನ್ನ", "kn"], ["चावल", "hi"],
      ["rice", "rom", true], ["sadam", "rom"], ["annam", "rom"], ["chawal", "rom"], ["metta annam", "rom"],
    ],
  },
  {
    id: "DAL_C", name: "Dal (cooked)", category: "legume", veg: true, serving: "1 katori",
    cal: 116, p: 6.2, c: 16.0, f: 2.1, fb: 4.2, na: 190, k: 300, ph: 110,
    tags: ["lunch", "dinner", "legume", "high_protein", "high_fiber"], allergens: [],
    aliases: [
      ["Dal", "en", true], ["Daal", "en"], ["Lentil Curry", "en"], ["பருப்பு", "ta"], ["పప్పు", "te"], ["ತೊವ್ವೆ", "kn"], ["दाल", "hi"],
      ["dal", "rom", true], ["daal", "rom"], ["paruppu", "rom"], ["pappu", "rom"], ["thovve", "rom"],
    ],
  },
  {
    id: "UPMA", name: "Upma", category: "dish", veg: true, serving: "1 katori",
    cal: 192, p: 4.5, c: 30.0, f: 5.8, fb: 2.2, na: 240,
    tags: ["breakfast", "south_indian"], allergens: ["gluten"],
    aliases: [
      ["Upma", "en", true], ["Uppuma", "en"], ["உப்மா", "ta"], ["ఉప్మా", "te"], ["ಉಪ್ಪಿಟ್ಟು", "kn"], ["उपमा", "hi"],
      ["upma", "rom", true], ["uppittu", "rom"], ["uppuma", "rom"],
    ],
  },
  {
    id: "PONGAL", name: "Ven Pongal", category: "dish", veg: true, serving: "1 katori",
    cal: 240, p: 6.0, c: 36.0, f: 7.5, fb: 1.8, na: 290, ph: 95,
    tags: ["breakfast", "south_indian"], allergens: ["dairy"],
    aliases: [
      ["Pongal", "en", true], ["Ven Pongal", "en"], ["Ghee Pongal", "en"], ["பொங்கல்", "ta"], ["పొంగల్", "te"], ["ಪೊಂಗಲ್", "kn"],
      ["pongal", "rom", true], ["ven pongal", "rom"],
    ],
  },
  {
    id: "CURD", name: "Curd (Yogurt)", category: "dairy", veg: true, serving: "1 katori",
    cal: 90, p: 4.8, c: 7.0, f: 4.5, fb: 0, sugar: 6.0, na: 60, k: 180, ph: 135, chol: 12, sat: 2.9,
    tags: ["lunch", "dinner", "probiotic", "high_protein"], allergens: ["dairy"],
    aliases: [
      ["Curd", "en", true], ["Yogurt", "en"], ["தயிர்", "ta"], ["పెరుగు", "te"], ["ಮೊಸರು", "kn"], ["दही", "hi"],
      ["curd", "rom", true], ["thayir", "rom"], ["perugu", "rom"], ["mosaru", "rom"], ["dahi", "rom"],
    ],
  },
  {
    id: "MILK", name: "Milk (toned)", category: "dairy", veg: true, serving: "1 glass",
    cal: 118, p: 6.2, c: 9.6, f: 5.2, fb: 0, sugar: 9.6, na: 100, k: 300, ph: 220, chol: 18, sat: 3.3,
    tags: ["beverage", "high_protein"], allergens: ["dairy"],
    aliases: [
      ["Milk", "en", true], ["பால்", "ta"], ["పాలు", "te"], ["ಹಾಲು", "kn"], ["दूध", "hi"],
      ["milk", "rom", true], ["paal", "rom"], ["palu", "rom"], ["haalu", "rom"], ["doodh", "rom"],
    ],
  },
  {
    id: "EGG_B", name: "Boiled Egg", category: "egg", veg: false, egg: true, serving: "1 piece",
    cal: 78, p: 6.3, c: 0.6, f: 5.3, fb: 0, na: 62, k: 63, ph: 86, chol: 186, sat: 1.6,
    tags: ["breakfast", "high_protein"], allergens: ["egg"],
    aliases: [
      ["Boiled Egg", "en", true], ["Egg", "en"], ["முட்டை", "ta"], ["గుడ్డు", "te"], ["ಮೊಟ್ಟೆ", "kn"], ["अंडा", "hi"],
      ["egg", "rom", true], ["muttai", "rom"], ["guddu", "rom"], ["anda", "rom"],
    ],
  },
  {
    id: "OMELETTE", name: "Omelette", category: "egg", veg: false, egg: true, serving: "1 piece",
    cal: 110, p: 6.5, c: 0.8, f: 8.2, fb: 0, na: 180, chol: 190, sat: 2.8,
    tags: ["breakfast", "high_protein"], allergens: ["egg"],
    aliases: [
      ["Omelette", "en", true], ["Omelet", "en"], ["గుడ్డు దోస", "te"],
      ["omelette", "rom", true],
    ],
  },
  {
    id: "CHICKEN_BR", name: "Grilled Chicken Breast", category: "meat", veg: false, serving: "100 g",
    cal: 165, p: 31.0, c: 0, f: 3.6, fb: 0, na: 74, k: 256, ph: 210, chol: 85, sat: 1.0,
    tags: ["lunch", "dinner", "high_protein", "non_veg"], allergens: [],
    aliases: [
      ["Grilled Chicken", "en", true], ["Chicken Breast", "en"], ["கோழி", "ta"], ["కోడి", "te"], ["ಕೋಳಿ", "kn"], ["चिकन", "hi"],
      ["chicken", "rom", true], ["grilled chicken", "rom"],
    ],
  },
  {
    id: "CHICKEN_CURRY", name: "Chicken Curry", category: "dish", veg: false, serving: "1 katori",
    cal: 210, p: 16.0, c: 7.0, f: 13.0, fb: 1.2, na: 380, ph: 160, chol: 75, sat: 4.5,
    tags: ["lunch", "dinner", "high_protein", "non_veg"], allergens: [],
    aliases: [
      ["Chicken Curry", "en", true], ["கோழி குழம்பு", "ta"], ["కోడి కూర", "te"], ["ಕೋಳಿ ಸಾರು", "kn"], ["चिकन करी", "hi"],
      ["chicken curry", "rom", true], ["kozhi kuzhambu", "rom"], ["kodi kura", "rom"], ["koli saaru", "rom"],
    ],
  },
  {
    id: "FISH_CURRY", name: "Fish Curry", category: "dish", veg: false, serving: "1 katori",
    cal: 180, p: 17.0, c: 6.0, f: 9.5, fb: 1.0, na: 350, ph: 200, chol: 70, sat: 2.4,
    tags: ["lunch", "dinner", "high_protein", "non_veg"], allergens: ["fish"],
    aliases: [
      ["Fish Curry", "en", true], ["Fish", "en"], ["மீன் குழம்பு", "ta"], ["చేపల కూర", "te"], ["ಮೀನು ಸಾರು", "kn"], ["मछली करी", "hi"],
      ["fish curry", "rom", true], ["meen kuzhambu", "rom"], ["chepa pulusu", "rom"], ["fish", "rom"],
    ],
  },
  {
    id: "EGG_CURRY", name: "Egg Curry", category: "dish", veg: false, egg: true, serving: "1 katori",
    cal: 195, p: 9.0, c: 6.0, f: 14.5, fb: 1.2, na: 320, chol: 210, sat: 4.2,
    tags: ["lunch", "dinner", "high_protein", "non_veg"], allergens: ["egg", "dairy"],
    aliases: [
      ["Egg Curry", "en", true], ["Egg Masala", "en"], ["முட்டை குழம்பு", "ta"], ["గుడ్డు కూర", "te"],
      ["egg curry", "rom", true], ["muttai curry", "rom"],
    ],
  },
  {
    id: "PANEER", name: "Paneer", category: "dairy", veg: true, serving: "100 g",
    cal: 265, p: 18.0, c: 3.5, f: 20.8, fb: 0, sugar: 2.6, na: 18, ph: 270, chol: 60, sat: 13.1,
    tags: ["high_protein"], allergens: ["dairy"],
    aliases: [
      ["Paneer", "en", true], ["Cottage Cheese", "en"], ["பனீர்", "ta"], ["పన్నీర్", "te"], ["पनीर", "hi"],
      ["paneer", "rom", true],
    ],
  },
  {
    id: "TOFU", name: "Tofu", category: "legume", veg: true, serving: "100 g",
    cal: 76, p: 8.0, c: 1.9, f: 4.8, fb: 0.3, na: 7, k: 121, ph: 121,
    tags: ["high_protein", "plant_based"], allergens: ["soy"],
    aliases: [
      ["Tofu", "en", true], ["Bean Curd", "en"], ["Soy Paneer", "en"],
      ["tofu", "rom", true],
    ],
  },
  {
    id: "SALAD_V", name: "Vegetable Salad", category: "vegetable", veg: true, serving: "1 katori",
    cal: 35, p: 1.5, c: 7.0, f: 0.3, fb: 2.5, na: 15, k: 220, ph: 30,
    tags: ["lunch", "dinner", "high_fiber", "raw"], allergens: [],
    aliases: [
      ["Salad", "en", true], ["Vegetable Salad", "en"], ["சாலட்", "ta"], ["సలాడ్", "te"], ["ಸಲಾಡ್", "kn"], ["सलाद", "hi"],
      ["salad", "rom", true], ["kosambari", "rom"], ["kachumber", "rom"],
    ],
  },
  {
    id: "RAJMA", name: "Rajma Curry", category: "legume", veg: true, serving: "1 katori",
    cal: 180, p: 9.5, c: 28.0, f: 3.0, fb: 7.4, na: 290, k: 400, ph: 180,
    tags: ["lunch", "dinner", "legume", "high_protein", "high_fiber"], allergens: [],
    aliases: [
      ["Rajma", "en", true], ["Kidney Bean Curry", "en"], ["ராஜ்மா", "ta"], ["రాజ్మా", "te"], ["राजमा", "hi"],
      ["rajma", "rom", true],
    ],
  },
  {
    id: "CHOLE", name: "Chole (Chana Masala)", category: "legume", veg: true, serving: "1 katori",
    cal: 210, p: 9.0, c: 30.0, f: 5.0, fb: 7.9, na: 320, k: 380, ph: 170,
    tags: ["lunch", "dinner", "legume", "high_protein", "high_fiber"], allergens: [],
    aliases: [
      ["Chole", "en", true], ["Chana Masala", "en"], ["Chickpea Curry", "en"], ["கொண்டைக்கடலை", "ta"], ["శనగ", "te"], ["छोले", "hi"],
      ["chole", "rom", true], ["chana", "rom"], ["channa", "rom"],
    ],
  },
  {
    id: "POHA", name: "Poha", category: "dish", veg: true, serving: "1 katori",
    cal: 205, p: 4.0, c: 40.0, f: 3.8, fb: 1.6, na: 200,
    tags: ["breakfast"], allergens: ["peanuts"],
    aliases: [
      ["Poha", "en", true], ["Flattened Rice", "en"], ["அவல்", "ta"], ["అటుకులు", "te"], ["ಅವಲಕ್ಕಿ", "kn"], ["पोहा", "hi"],
      ["poha", "rom", true], ["aval", "rom"], ["atukulu", "rom"], ["avalakki", "rom"],
    ],
  },
  {
    id: "PARATHA", name: "Paratha", category: "dish", veg: true, serving: "1 piece",
    cal: 210, p: 4.8, c: 30.0, f: 8.0, fb: 3.0, na: 160, ph: 90,
    tags: ["breakfast", "north_indian"], allergens: ["gluten", "dairy"],
    aliases: [
      ["Paratha", "en", true], ["பராத்தா", "ta"], ["पराठा", "hi"],
      ["paratha", "rom", true],
    ],
  },
  {
    id: "PURI", name: "Puri", category: "dish", veg: true, serving: "1 piece",
    cal: 105, p: 1.8, c: 12.0, f: 5.6, fb: 0.9, na: 95, sat: 1.9,
    tags: ["breakfast", "fried", "north_indian"], allergens: ["gluten"],
    aliases: [
      ["Puri", "en", true], ["Poori", "en"], ["பூரி", "ta"], ["पूरी", "hi"],
      ["puri", "rom", true], ["poori", "rom"],
    ],
  },
  {
    id: "VADA", name: "Medu Vada", category: "dish", veg: true, serving: "1 piece",
    cal: 130, p: 3.2, c: 15.0, f: 6.5, fb: 1.4, na: 170,
    tags: ["breakfast", "fried", "south_indian"], allergens: [],
    aliases: [
      ["Vada", "en", true], ["Medu Vada", "en"], ["Ulundu Vadai", "en"], ["வடை", "ta"], ["వడ", "te"], ["ವಡೆ", "kn"], ["वड़ा", "hi"],
      ["vada", "rom", true], ["vadai", "rom"], ["vade", "rom"], ["medu vada", "rom"],
    ],
  },
  {
    id: "UTTAPAM", name: "Uttapam", category: "dish", veg: true, serving: "1 piece",
    cal: 170, p: 4.0, c: 26.0, f: 4.8, fb: 1.8, na: 150,
    tags: ["breakfast", "fermented", "south_indian"], allergens: [],
    aliases: [
      ["Uttapam", "en", true], ["Oothapam", "en"], ["ஊத்தாப்பம்", "ta"], ["ఉతప్పం", "te"], ["ಉತ್ತಪ್ಪ", "kn"],
      ["uttapam", "rom", true], ["oothapam", "rom"],
    ],
  },
  {
    id: "KHICHDI_V", name: "Vegetable Khichdi", category: "dish", veg: true, serving: "1 katori",
    cal: 220, p: 7.5, c: 34.0, f: 5.5, fb: 3.5, na: 230, k: 280, ph: 130,
    tags: ["lunch", "dinner", "high_fiber"], allergens: ["dairy"],
    aliases: [
      ["Khichdi", "en", true], ["Vegetable Khichdi", "en"], ["Khichari", "en"], ["ఖిచిడీ", "te"], ["ಖಿಚಡಿ", "kn"], ["खिचड़ी", "hi"],
      ["khichdi", "rom", true],
    ],
  },
  {
    id: "SABZI_M", name: "Mixed Vegetable Sabzi", category: "dish", veg: true, serving: "1 katori",
    cal: 115, p: 3.0, c: 14.0, f: 5.5, fb: 3.8, na: 220, k: 260, ph: 60,
    tags: ["lunch", "dinner", "vegetable", "high_fiber"], allergens: [],
    aliases: [
      ["Sabzi", "en", true], ["Vegetable Curry", "en"], ["Mixed Veg", "en"], ["பொரியல்", "ta"], ["కూర", "te"], ["ಪಲ್ಯ", "kn"], ["सब्ज़ी", "hi"],
      ["sabzi", "rom", true], ["poriyal", "rom"], ["kura", "rom"], ["palya", "rom"], ["bhaji", "rom"],
    ],
  },
  {
    id: "PALAK_PANEER", name: "Palak Paneer", category: "dish", veg: true, serving: "1 katori",
    cal: 190, p: 8.0, c: 9.0, f: 13.5, fb: 3.0, sugar: 3.0, na: 280, k: 420, ph: 200, chol: 30, sat: 6.0,
    tags: ["lunch", "dinner", "high_protein", "vegetable"], allergens: ["dairy"],
    aliases: [
      ["Palak Paneer", "en", true], ["Spinach Paneer", "en"],
      ["palak paneer", "rom", true],
    ],
  },
  {
    id: "RASAM", name: "Rasam", category: "dish", veg: true, serving: "1 katori",
    cal: 45, p: 2.0, c: 7.0, f: 1.0, fb: 1.0, na: 350, k: 180,
    tags: ["lunch", "dinner", "south_indian"], allergens: [],
    aliases: [
      ["Rasam", "en", true], ["ரசம்", "ta"], ["చారు", "te"], ["ಸಾರು", "kn"], ["रसम", "hi"],
      ["rasam", "rom", true], ["chaaru", "rom"], ["saaru", "rom"],
    ],
  },
  {
    id: "BIRYANI_CH", name: "Chicken Biryani", category: "dish", veg: false, serving: "1 katori",
    cal: 340, p: 14.0, c: 42.0, f: 12.0, fb: 1.5, na: 450, ph: 150, chol: 60, sat: 4.0,
    tags: ["lunch", "dinner", "non_veg"], allergens: ["dairy"],
    aliases: [
      ["Biryani", "en", true], ["Chicken Biryani", "en"], ["பிரியாணி", "ta"], ["బిర్యానీ", "te"], ["बिरयानी", "hi"],
      ["biryani", "rom", true], ["biriyani", "rom"],
    ],
  },
  {
    id: "SAMOSA", name: "Samosa", category: "dish", veg: true, serving: "1 piece",
    cal: 150, p: 2.7, c: 17.0, f: 8.0, fb: 1.5, na: 250, sat: 3.5,
    tags: ["snack", "fried"], allergens: ["gluten"],
    aliases: [
      ["Samosa", "en", true], ["சமோசா", "ta"], ["समोसा", "hi"],
      ["samosa", "rom", true],
    ],
  },
  {
    id: "SPROUTS_M", name: "Moong Sprouts Chaat", category: "legume", veg: true, serving: "1 katori",
    cal: 60, p: 4.5, c: 9.0, f: 0.3, fb: 2.8, na: 40, k: 180, ph: 80,
    tags: ["snack", "high_protein", "high_fiber", "raw"], allergens: [],
    aliases: [
      ["Sprouts", "en", true], ["Moong Sprouts", "en"], ["Sprout Chaat", "en"], ["முளைகட்டிய", "ta"], ["మొలకలు", "te"], ["अंकुरित", "hi"],
      ["sprouts", "rom", true], ["pesalu sprouts", "rom"],
    ],
  },
  {
    id: "BUTTERMILK", name: "Buttermilk", category: "dairy", veg: true, serving: "1 glass",
    cal: 45, p: 1.8, c: 5.0, f: 1.8, fb: 0, sugar: 4.0, na: 220, k: 150, ph: 90,
    tags: ["beverage", "probiotic"], allergens: ["dairy"],
    aliases: [
      ["Buttermilk", "en", true], ["மோர்", "ta"], ["మజ్జిగ", "te"], ["ಮಜ್ಜಿಗೆ", "kn"], ["छाछ", "hi"],
      ["buttermilk", "rom", true], ["moru", "rom"], ["majjiga", "rom"], ["chaas", "rom"],
    ],
  },
  {
    id: "COCONUT_W", name: "Coconut Water", category: "beverage", veg: true, serving: "1 glass",
    cal: 38, p: 1.0, c: 6.0, f: 0.2, fb: 1.1, sugar: 6.0, na: 105, k: 300,
    tags: ["beverage"], allergens: [],
    aliases: [
      ["Coconut Water", "en", true], ["இளநீர்", "ta"], ["కొబ్బరి నీళ్లు", "te"], ["ಎಳನೀರು", "kn"], ["नारियल पानी", "hi"],
      ["coconut water", "rom", true], ["elaneer", "rom"],
    ],
  },
  {
    id: "MASALA_CHAI", name: "Masala Chai", category: "beverage", veg: true, serving: "1 cup",
    cal: 85, p: 2.7, c: 12.0, f: 3.0, fb: 0, sugar: 10.0, na: 40, k: 130, ph: 90, chol: 10, sat: 1.9,
    tags: ["beverage"], allergens: ["dairy"],
    aliases: [
      ["Chai", "en", true], ["Tea", "en"], ["Masala Tea", "en"], ["தேநீர்", "ta"], ["టీ", "te"], ["ಚಹಾ", "kn"], ["चाय", "hi"],
      ["chai", "rom", true], ["chaaya", "rom"], ["tea", "rom"],
    ],
  },
  {
    id: "COFFEE_F", name: "Filter Coffee (with milk & sugar)", category: "beverage", veg: true, serving: "1 cup",
    cal: 70, p: 2.3, c: 10.0, f: 2.2, fb: 0, sugar: 9.0, na: 35, k: 120, ph: 85, sat: 1.4,
    tags: ["beverage"], allergens: ["dairy"],
    aliases: [
      ["Coffee", "en", true], ["Filter Coffee", "en"], ["காபி", "ta"], ["కాఫీ", "te"], ["ಕಾಫಿ", "kn"], ["कॉफ़ी", "hi"],
      ["coffee", "rom", true], ["kaapi", "rom"],
    ],
  },
  {
    id: "OATS_P", name: "Oats Porridge", category: "dish", veg: true, serving: "1 bowl",
    cal: 150, p: 5.5, c: 27.0, f: 2.5, fb: 3.8, na: 5, ph: 130,
    tags: ["breakfast", "whole_grain", "high_fiber"], allergens: ["gluten"],
    aliases: [
      ["Oats", "en", true], ["Oatmeal", "en"], ["Oats Porridge", "en"],
      ["oats", "rom", true], ["oatmeal", "rom"],
    ],
  },
  {
    id: "WHEAT_BREAD", name: "Whole Wheat Bread", category: "grain", veg: true, serving: "2 slices",
    cal: 150, p: 5.4, c: 27.0, f: 1.9, fb: 2.7, na: 280, ph: 80,
    tags: ["breakfast"], allergens: ["gluten"],
    aliases: [
      ["Bread", "en", true], ["Wheat Bread", "en"], ["Brown Bread", "en"],
      ["bread", "rom", true],
    ],
  },
  {
    id: "BROWN_RICE", name: "Brown Rice (cooked)", category: "grain", veg: true, serving: "1 katori",
    cal: 165, p: 3.8, c: 34.0, f: 1.3, fb: 2.7, na: 5, ph: 85,
    tags: ["lunch", "dinner", "whole_grain"], allergens: [],
    aliases: [
      ["Brown Rice", "en", true],
      ["brown rice", "rom", true],
    ],
  },
  {
    id: "GHEE", name: "Ghee", category: "fat", veg: true, serving: "1 tsp",
    cal: 45, p: 0, c: 0, f: 5.0, fb: 0, na: 1, chol: 13, sat: 3.2,
    tags: ["fat"], allergens: ["dairy"],
    aliases: [
      ["Ghee", "en", true], ["Clarified Butter", "en"], ["நெய்", "ta"], ["నెయ్యి", "te"], ["ತುಪ್ಪ", "kn"], ["घी", "hi"],
      ["ghee", "rom", true], ["ney", "rom"], ["tuppa", "rom"],
    ],
  },
  {
    id: "APPLE", name: "Apple", category: "fruit", veg: true, serving: "1 medium",
    cal: 94, p: 0.5, c: 25.0, f: 0.3, fb: 4.4, sugar: 19.0, na: 2, k: 195,
    tags: ["snack", "fruit", "high_fiber"], allergens: [],
    aliases: [
      ["Apple", "en", true], ["ஆப்பிள்", "ta"], ["ఆపిల్", "te"], ["ಆಪಲ್", "kn"], ["सेब", "hi"],
      ["apple", "rom", true], ["seb", "rom"],
    ],
  },
  {
    id: "BANANA", name: "Banana", category: "fruit", veg: true, serving: "1 medium",
    cal: 105, p: 1.3, c: 27.0, f: 0.4, fb: 3.1, sugar: 14.0, na: 1, k: 422, ph: 26,
    tags: ["snack", "fruit", "high_fiber"], allergens: [],
    aliases: [
      ["Banana", "en", true], ["வாழைப்பழம்", "ta"], ["అరటిపండు", "te"], ["ಬಾಳೆಹಣ್ಣು", "kn"], ["केला", "hi"],
      ["banana", "rom", true], ["kela", "rom"], ["vazhaipazham", "rom"], ["aratipandu", "rom"], ["balehannu", "rom"],
    ],
  },
  {
    id: "ORANGE", name: "Orange", category: "fruit", veg: true, serving: "1 medium",
    cal: 66, p: 1.2, c: 16.5, f: 0.3, fb: 3.4, sugar: 12.0, na: 1, k: 237,
    tags: ["snack", "fruit", "high_fiber"], allergens: [],
    aliases: [
      ["Orange", "en", true], ["ஆரஞ்சு", "ta"], ["కమలా", "te"], ["ಕಿತ್ತಳೆ", "kn"], ["संतरा", "hi"],
      ["orange", "rom", true], ["santra", "rom"],
    ],
  },
  {
    id: "GUAVA", name: "Guava", category: "fruit", veg: true, serving: "1 medium",
    cal: 68, p: 2.6, c: 14.0, f: 1.0, fb: 5.4, sugar: 9.0, na: 2, k: 417, ph: 40,
    tags: ["snack", "fruit", "high_fiber"], allergens: [],
    aliases: [
      ["Guava", "en", true], ["கொய்யா", "ta"], ["జామ", "te"], ["ಪೇರಲೆ", "kn"], ["अमरूद", "hi"],
      ["guava", "rom", true], ["koyya", "rom"], ["jaam", "rom"], ["perale", "rom"],
    ],
  },
  {
    id: "PAPAYA", name: "Papaya", category: "fruit", veg: true, serving: "1 katori",
    cal: 55, p: 0.9, c: 14.0, f: 0.3, fb: 2.5, sugar: 11.0, na: 8, k: 264,
    tags: ["snack", "fruit"], allergens: [],
    aliases: [
      ["Papaya", "en", true], ["பப்பாளி", "ta"], ["బొప్పాయి", "te"], ["ಪಪ್ಪಾಯಿ", "kn"], ["पपीता", "hi"],
      ["papaya", "rom", true], ["papita", "rom"], ["boppayi", "rom"],
    ],
  },
  {
    id: "PEANUTS", name: "Roasted Peanuts", category: "legume", veg: true, serving: "30 g",
    cal: 170, p: 7.7, c: 4.8, f: 14.5, fb: 2.5, na: 5, k: 190, ph: 110,
    tags: ["snack", "high_protein"], allergens: ["peanuts"],
    aliases: [
      ["Peanuts", "en", true], ["Groundnuts", "en"], ["வேர்க்கடலை", "ta"], ["పల్లీలు", "te"], ["ಶೇಂಗಾ", "kn"], ["मूंगफली", "hi"],
      ["peanuts", "rom", true], ["verkadalai", "rom"], ["pallilu", "rom"], ["moongfali", "rom"],
    ],
  },
  {
    id: "ALMONDS", name: "Almonds", category: "fruit", veg: true, serving: "10 pieces",
    cal: 70, p: 2.6, c: 2.5, f: 6.1, fb: 1.5, na: 1, k: 85, ph: 60,
    tags: ["snack"], allergens: ["nuts"],
    aliases: [
      ["Almonds", "en", true], ["பாதாம்", "ta"], ["బాదం", "te"], ["ಬಾದಾಮಿ", "kn"], ["बादाम", "hi"],
      ["almonds", "rom", true], ["badam", "rom"],
    ],
  },
  {
    id: "CUCUMBER", name: "Cucumber", category: "vegetable", veg: true, serving: "100 g",
    cal: 15, p: 0.7, c: 3.6, f: 0.1, fb: 0.6, na: 2, k: 147,
    tags: ["snack", "vegetable", "raw"], allergens: [],
    aliases: [
      ["Cucumber", "en", true], ["வெள்ளரி", "ta"], ["కీరదోస", "te"], ["ಸೌತೆಕಾಯಿ", "kn"], ["खीरा", "hi"],
      ["cucumber", "rom", true], ["keera", "rom"], ["kheera", "rom"],
    ],
  },
  {
    id: "TOMATO", name: "Tomato", category: "vegetable", veg: true, serving: "100 g",
    cal: 18, p: 0.9, c: 3.9, f: 0.2, fb: 1.2, na: 5, k: 237,
    tags: ["vegetable", "raw"], allergens: [],
    aliases: [
      ["Tomato", "en", true], ["தக்காளி", "ta"], ["టమాటా", "te"], ["ಟೊಮ್ಯಾಟೊ", "kn"], ["टमाटर", "hi"],
      ["tomato", "rom", true], ["tamatar", "rom"], ["thakkali", "rom"],
    ],
  },
  {
    id: "SPINACH_C", name: "Spinach (cooked)", category: "vegetable", veg: true, serving: "100 g",
    cal: 23, p: 2.9, c: 3.6, f: 0.4, fb: 2.2, na: 79, k: 558, ph: 49,
    tags: ["vegetable", "high_fiber"], allergens: [],
    aliases: [
      ["Spinach", "en", true], ["Palak", "en"], ["கீரை", "ta"], ["పాలకూర", "te"], ["ಪಾಲಕ", "kn"], ["पालक", "hi"],
      ["spinach", "rom", true], ["palak", "rom"], ["keerai", "rom"], ["palakura", "rom"],
    ],
  },
];

// ---------- Evidence corpus (public-health guidance summaries) ----------

type EvidenceSeed = { source: string; document: string; section?: string; text: string; tags: string[] };

const EVIDENCE: EvidenceSeed[] = [
  { source: "WHO", document: "Healthy Diet Fact Sheet", section: "Key facts", text: "A healthy diet includes at least 400 g (five portions) of fruit and vegetables per day, excluding potatoes and other starchy roots. Free sugars should be less than 10% of total energy intake; reducing to below 5% provides additional health benefits.", tags: ["general", "fruit", "vegetables", "sugar"] },
  { source: "WHO", document: "Healthy Diet Fact Sheet", section: "Sodium", text: "Keeping salt intake to less than 5 g per day (less than 2 g sodium) helps prevent hypertension and reduces the risk of heart disease and stroke in the adult population.", tags: ["general", "sodium", "cardiovascular"] },
  { source: "WHO", document: "Healthy Diet Fact Sheet", section: "Fats", text: "Total fat should not exceed 30% of total energy intake. Intake of saturated fat should be less than 10% of total energy intake, and trans fat less than 1%, replacing them with unsaturated fats.", tags: ["general", "fat", "cardiovascular"] },
  { source: "ICMR-NIN", document: "RDA 2020 (Nutrient Requirements for Indians)", section: "Protein", text: "The Indian Council of Medical Research - National Institute of Nutrition recommends a protein allowance of approximately 0.83 g per kg body weight per day for sedentary adults, higher with physical activity.", tags: ["protein", "general"] },
  { source: "ICMR-NIN", document: "RDA 2020", section: "Fibre", text: "NIN recommends a daily dietary fibre intake of at least 25-30 g per day for adults, obtained from whole grains, legumes, vegetables and fruits, to support gut health and metabolic outcomes.", tags: ["fiber", "general"] },
  { source: "ICMR-NIN", document: "Dietary Guidelines for Indians", section: "Meal patterns", text: "Eat a variety of foods including cereals, pulses, vegetables and fruits. Pulses combined with cereals improve protein quality. Include at least one katori of green leafy vegetables daily.", tags: ["general", "indian", "variety"] },
  { source: "ADA", document: "Standards of Care in Diabetes 2024", section: "Nutrition therapy", text: "For people with type 2 diabetes, individualized medical nutrition therapy should emphasize carbohydrate quality and quantity distribution across meals. Consistent carbohydrate intake at meals supports glycemic management.", tags: ["T2DM", "carbohydrate"] },
  { source: "ADA", document: "Standards of Care in Diabetes 2024", section: "Fibre", text: "People with diabetes are encouraged to consume at least 14 g of fibre per 1,000 kcal, from vegetables, pulses, fruits and whole grains, as higher fibre intakes are associated with lower glycemia.", tags: ["T2DM", "fiber"] },
  { source: "ADA", document: "Standards of Care in Diabetes 2024", section: "Sugar", text: "People with diabetes should minimize consumption of sugar-sweetened beverages and foods with added sugars, replacing them with water or nutrient-dense options to reduce glycemic load.", tags: ["T2DM", "sugar"] },
  { source: "KDIGO", document: "CKD Guideline: Nutrition Management", section: "Protein", text: "For adults with chronic kidney disease not on dialysis, a protein intake of about 0.8 g per kg body weight per day is recommended, individualized with clinical supervision.", tags: ["CKD", "protein"] },
  { source: "KDIGO", document: "CKD Guideline: Nutrition Management", section: "Sodium", text: "Sodium intake in CKD should generally be limited to less than 2 g per day (about 5 g salt) to help control blood pressure and fluid retention.", tags: ["CKD", "sodium"] },
  { source: "KDIGO", document: "CKD Guideline: Nutrition Management", section: "Potassium & phosphorus", text: "Potassium and phosphorus management in CKD should be individualized based on serum levels and clinical context; foods very high in potassium or phosphorus additives may need restriction when labs indicate.", tags: ["CKD", "potassium", "phosphorus"] },
  { source: "AHA", document: "Diet and Lifestyle Recommendations", section: "Saturated fat", text: "The American Heart Association recommends limiting saturated fat to less than 6% of daily calories and choosing lean protein sources, to lower LDL cholesterol and cardiovascular risk.", tags: ["CVD", "saturatedFat"] },
  { source: "AHA", document: "Diet and Lifestyle Recommendations", section: "Sodium", text: "For heart health, aim for no more than 2,300 mg sodium per day, moving toward an ideal limit of 1,500 mg for most adults, especially those with hypertension.", tags: ["CVD", "sodium"] },
  { source: "AHA", document: "Diet and Lifestyle Recommendations", section: "Cholesterol", text: "Dietary patterns rich in vegetables, fruits, whole grains, legumes, nuts, and fish, and low in dietary cholesterol and saturated fat, are associated with reduced cardiovascular disease risk.", tags: ["CVD", "cholesterol"] },
  { source: "USDA", document: "Dietary Guidelines for Americans", section: "Added sugars", text: "Added sugars should contribute less than 10% of daily energy intake for adults and children, supporting overall diet quality and healthy body weight.", tags: ["general", "sugar"] },
  { source: "USDA", document: "Dietary Guidelines for Americans", section: "Whole grains", text: "Make at least half of grain intake whole grains, which retain fibre, vitamins and minerals that are removed in refined grains.", tags: ["general", "fiber", "whole_grain"] },
  { source: "IFCT2017", document: "Indian Food Composition Tables", section: "Reference", text: "IFCT 2017 provides analytical nutrient values for Indian foods and is the primary reference for the nutrition figures used in this application, complemented by USDA FoodData Central where needed.", tags: ["reference", "database"] },
  { source: "WHO", document: "Physical activity guidance", section: "Energy balance", text: "Regular physical activity combined with balanced energy intake supports healthy weight. Adults should aim for at least 150 minutes of moderate-intensity activity per week.", tags: ["general", "activity", "energy"] },
  { source: "ICMR-NIN", document: "Dietary Guidelines for Indians", section: "Snacks", text: "Choose nutrient-dense snacks such as fruits, sprouts, nuts and buttermilk over deep-fried or sugar-rich snack foods, particularly for individuals managing weight or blood glucose.", tags: ["snack", "general", "T2DM"] },
];

// ---------- Disease constraints (configurable, evidence-backed) ----------

const CONSTRAINTS = [
  { condition: "T2DM", nutrient: "carbohydrates", comparator: "max", perMealValue: 75, dailyValue: 225, severity: "warning", message: "Keep per-meal carbohydrate load moderate and distribute evenly across meals.", evidenceSource: "ADA Standards of Care 2024" },
  { condition: "T2DM", nutrient: "sugar", comparator: "max", perMealValue: 12, dailyValue: 36, severity: "hard", message: "Minimize added/free sugars at this meal.", evidenceSource: "ADA Standards of Care 2024" },
  { condition: "T2DM", nutrient: "fiber", comparator: "min", perMealValue: 5, dailyValue: 25, severity: "warning", message: "Prefer fibre-rich foods to blunt post-meal glucose excursions.", evidenceSource: "ADA Standards of Care 2024" },
  { condition: "CKD", nutrient: "sodium", comparator: "max", perMealValue: 500, dailyValue: 2000, severity: "hard", message: "Limit salt and salty foods at this meal.", evidenceSource: "KDIGO CKD Nutrition Guideline" },
  { condition: "CKD", nutrient: "potassium", comparator: "max", perMealValue: 1200, dailyValue: 3000, severity: "warning", message: "Watch very high-potassium foods; individualize based on labs.", evidenceSource: "KDIGO CKD Nutrition Guideline" },
  { condition: "CKD", nutrient: "phosphorus", comparator: "max", perMealValue: 450, dailyValue: 1200, severity: "warning", message: "Limit phosphorus-dense foods at this meal.", evidenceSource: "KDIGO CKD Nutrition Guideline" },
  { condition: "CKD", nutrient: "protein", comparator: "max", perMealValue: 30, dailyValue: null as number | null, severity: "warning", message: "Keep protein moderate (approx. 0.8 g/kg/day) unless advised otherwise.", evidenceSource: "KDIGO CKD Nutrition Guideline" },
  { condition: "CVD", nutrient: "sodium", comparator: "max", perMealValue: 600, dailyValue: 2300, severity: "hard", message: "Limit salty foods to support blood pressure control.", evidenceSource: "AHA Diet & Lifestyle Recommendations" },
  { condition: "CVD", nutrient: "saturatedFat", comparator: "max", perMealValue: 5, dailyValue: 15, severity: "warning", message: "Prefer meals low in saturated fat.", evidenceSource: "AHA Diet & Lifestyle Recommendations" },
  { condition: "CVD", nutrient: "cholesterol", comparator: "max", perMealValue: 100, dailyValue: 300, severity: "warning", message: "Keep dietary cholesterol moderate at this meal.", evidenceSource: "AHA Diet & Lifestyle Recommendations" },
];

// ---------- Meal templates (deterministic candidate generation) ----------

type TemplateSeed = {
  id: string; name: string; description: string; slots: string[];
  diets: string[]; cuisine?: string;
  items: { foodId: string; quantity: number; unit: string }[];
};

const TEMPLATES: TemplateSeed[] = [
  { id: "tpl_idli_sambar", name: "Idli + Sambar", description: "Steamed fermented idlis with vegetable lentil sambar", slots: ["breakfast"], diets: ["vegetarian", "vegan"], cuisine: "south_indian", items: [{ foodId: "IDLI", quantity: 3, unit: "pieces" }, { foodId: "SAMBAR", quantity: 1, unit: "katori" }] },
  { id: "tpl_dosa_sambar", name: "Dosa + Sambar", description: "Fermented dosa with sambar", slots: ["breakfast"], diets: ["vegetarian", "vegan"], cuisine: "south_indian", items: [{ foodId: "DOSA", quantity: 2, unit: "pieces" }, { foodId: "SAMBAR", quantity: 1, unit: "katori" }] },
  { id: "tpl_upma_fruit", name: "Upma + Fruit", description: "Semolina upma with a fresh fruit serving", slots: ["breakfast"], diets: ["vegetarian", "vegan"], cuisine: "south_indian", items: [{ foodId: "UPMA", quantity: 1, unit: "katori" }, { foodId: "PAPAYA", quantity: 1, unit: "katori" }] },
  { id: "tpl_oats_banana", name: "Oats Porridge + Banana", description: "Whole-grain oats with banana", slots: ["breakfast"], diets: ["vegetarian", "vegan"], cuisine: "general", items: [{ foodId: "OATS_P", quantity: 1, unit: "bowl" }, { foodId: "BANANA", quantity: 1, unit: "medium" }] },
  { id: "tpl_egg_toast", name: "Boiled Eggs + Whole Wheat Toast", description: "Protein-rich egg breakfast", slots: ["breakfast"], diets: ["eggetarian", "non_vegetarian"], cuisine: "general", items: [{ foodId: "EGG_B", quantity: 2, unit: "pieces" }, { foodId: "WHEAT_BREAD", quantity: 1, unit: "2 slices" }] },
  { id: "tpl_poha_curd", name: "Poha + Curd", description: "Flattened rice with curd", slots: ["breakfast"], diets: ["vegetarian"], cuisine: "general", items: [{ foodId: "POHA", quantity: 1, unit: "katori" }, { foodId: "CURD", quantity: 0.5, unit: "katori" }] },
  { id: "tpl_dal_roti_salad", name: "Dal + Roti + Salad", description: "Lentils with whole-wheat roti and fresh salad", slots: ["lunch", "dinner"], diets: ["vegetarian", "vegan"], cuisine: "north_indian", items: [{ foodId: "DAL_C", quantity: 1, unit: "katori" }, { foodId: "ROTIP", quantity: 2, unit: "pieces" }, { foodId: "SALAD_V", quantity: 1, unit: "katori" }] },
  { id: "tpl_rice_dal_sabzi", name: "Rice + Dal + Sabzi", description: "Balanced traditional thali-style meal", slots: ["lunch", "dinner"], diets: ["vegetarian", "vegan"], cuisine: "general", items: [{ foodId: "RICE_C", quantity: 1, unit: "katori" }, { foodId: "DAL_C", quantity: 1, unit: "katori" }, { foodId: "SABZI_M", quantity: 1, unit: "katori" }] },
  { id: "tpl_rajma_rice", name: "Rajma + Rice + Salad", description: "Kidney bean curry with rice and salad", slots: ["lunch", "dinner"], diets: ["vegetarian", "vegan"], cuisine: "north_indian", items: [{ foodId: "RAJMA", quantity: 1, unit: "katori" }, { foodId: "RICE_C", quantity: 1, unit: "katori" }, { foodId: "SALAD_V", quantity: 1, unit: "katori" }] },
  { id: "tpl_chole_roti", name: "Chole + Roti + Salad", description: "Chickpea curry with roti", slots: ["lunch", "dinner"], diets: ["vegetarian", "vegan"], cuisine: "north_indian", items: [{ foodId: "CHOLE", quantity: 1, unit: "katori" }, { foodId: "ROTIP", quantity: 2, unit: "pieces" }, { foodId: "SALAD_V", quantity: 1, unit: "katori" }] },
  { id: "tpl_khichdi_curd", name: "Vegetable Khichdi + Curd", description: "Comforting one-pot meal with probiotic curd", slots: ["lunch", "dinner"], diets: ["vegetarian"], cuisine: "general", items: [{ foodId: "KHICHDI_V", quantity: 1.5, unit: "katori" }, { foodId: "CURD", quantity: 0.5, unit: "katori" }] },
  { id: "tpl_palak_roti", name: "Palak Paneer + Roti", description: "Iron and protein rich combination", slots: ["lunch", "dinner"], diets: ["vegetarian"], cuisine: "north_indian", items: [{ foodId: "PALAK_PANEER", quantity: 1, unit: "katori" }, { foodId: "ROTIP", quantity: 2, unit: "pieces" }] },
  { id: "tpl_sambar_rice", name: "Sambar + Rice + Cucumber", description: "Light South Indian meal", slots: ["lunch", "dinner"], diets: ["vegetarian", "vegan"], cuisine: "south_indian", items: [{ foodId: "SAMBAR", quantity: 1, unit: "katori" }, { foodId: "RICE_C", quantity: 1, unit: "katori" }, { foodId: "CUCUMBER", quantity: 100, unit: "g" }] },
  { id: "tpl_tofu_veg", name: "Tofu + Sabzi + Roti", description: "Plant protein with vegetables", slots: ["lunch", "dinner"], diets: ["vegetarian", "vegan"], cuisine: "general", items: [{ foodId: "TOFU", quantity: 100, unit: "g" }, { foodId: "SABZI_M", quantity: 1, unit: "katori" }, { foodId: "ROTIP", quantity: 2, unit: "pieces" }] },
  { id: "tpl_chicken_roti_salad", name: "Grilled Chicken + Roti + Salad", description: "Lean protein meal", slots: ["lunch", "dinner"], diets: ["non_vegetarian"], cuisine: "general", items: [{ foodId: "CHICKEN_BR", quantity: 100, unit: "g" }, { foodId: "ROTIP", quantity: 2, unit: "pieces" }, { foodId: "SALAD_V", quantity: 1, unit: "katori" }] },
  { id: "tpl_fish_rice", name: "Fish Curry + Rice", description: "Omega-3 rich fish curry with rice", slots: ["lunch", "dinner"], diets: ["non_vegetarian"], cuisine: "south_indian", items: [{ foodId: "FISH_CURRY", quantity: 1, unit: "katori" }, { foodId: "RICE_C", quantity: 1, unit: "katori" }] },
  { id: "tpl_egg_curry_roti", name: "Egg Curry + Roti", description: "Egg curry with roti", slots: ["lunch", "dinner"], diets: ["eggetarian", "non_vegetarian"], cuisine: "general", items: [{ foodId: "EGG_CURRY", quantity: 1, unit: "katori" }, { foodId: "ROTIP", quantity: 2, unit: "pieces" }] },
  { id: "tpl_fruit_nuts", name: "Fruit + Nuts", description: "Nutrient-dense light snack", slots: ["snack"], diets: ["vegetarian", "vegan", "eggetarian", "non_vegetarian"], cuisine: "general", items: [{ foodId: "APPLE", quantity: 1, unit: "medium" }, { foodId: "ALMONDS", quantity: 1, unit: "10 pieces" }] },
  { id: "tpl_sprouts_bm", name: "Sprouts Chaat + Buttermilk", description: "Protein-rich snack with probiotics", slots: ["snack"], diets: ["vegetarian"], cuisine: "general", items: [{ foodId: "SPROUTS_M", quantity: 1, unit: "katori" }, { foodId: "BUTTERMILK", quantity: 1, unit: "glass" }] },
  { id: "tpl_curd_fruit", name: "Curd + Guava", description: "Simple probiotic snack", slots: ["snack"], diets: ["vegetarian"], cuisine: "general", items: [{ foodId: "CURD", quantity: 1, unit: "katori" }, { foodId: "GUAVA", quantity: 1, unit: "medium" }] },
  { id: "tpl_peanuts_banana", name: "Peanuts + Banana", description: "Energy-dense healthy snack", slots: ["snack"], diets: ["vegetarian", "vegan", "eggetarian", "non_vegetarian"], cuisine: "general", items: [{ foodId: "PEANUTS", quantity: 1, unit: "30 g" }, { foodId: "BANANA", quantity: 1, unit: "medium" }] },
];

const DEMO_EMAIL = "demo@nutrislm.app";
const DEMO_PASSWORD = "demo1234";

async function main() {
  console.log("Seeding NutriSLM...");

  // Foods + aliases (idempotent upsert)
  for (const f of FOODS) {
    const data = {
      id: f.id,
      canonicalName: f.name,
      category: f.category,
      isVeg: f.veg,
      containsEgg: f.egg ?? false,
      servingUnit: f.serving,
      calories: f.cal,
      protein: f.p,
      carbohydrates: f.c,
      fat: f.f,
      fiber: f.fb,
      sugar: f.sugar ?? 0,
      sodium: f.na ?? 0,
      potassium: f.k ?? 0,
      phosphorus: f.ph ?? 0,
      cholesterol: f.chol ?? 0,
      saturatedFat: f.sat ?? 0,
      source: f.source ?? "IFCT2017",
      sourceReference: "Nutrient values referenced from IFCT 2017 / USDA FoodData Central",
      tags: JSON.stringify(f.tags),
      allergens: JSON.stringify(f.allergens ?? []),
    };
    await db.food.upsert({ where: { id: f.id }, update: data, create: data });

    for (const [alias, lang, primary] of f.aliases) {
      const norm = normalizeKey(alias);
      const aliasData = { foodId: f.id, alias, language: lang, normalizedAlias: norm, isPrimary: !!primary };
      const existing = await db.foodAlias.findFirst({ where: { normalizedAlias: norm, foodId: f.id } });
      if (existing) {
        await db.foodAlias.update({ where: { id: existing.id }, data: aliasData });
      } else {
        await db.foodAlias.create({ data: aliasData });
      }
    }
  }

  // Evidence
  for (const e of EVIDENCE) {
    const existing = await db.evidence.findFirst({ where: { source: e.source, document: e.document, section: e.section ?? "" } });
    const data = { source: e.source, document: e.document, section: e.section ?? "", text: e.text, tags: JSON.stringify(e.tags), isActive: true };
    if (existing) await db.evidence.update({ where: { id: existing.id }, data });
    else await db.evidence.create({ data });
  }

  // Constraints
  for (const c of CONSTRAINTS) {
    const existing = await db.diseaseConstraint.findFirst({ where: { condition: c.condition, nutrient: c.nutrient, comparator: c.comparator } });
    const data = { condition: c.condition, nutrient: c.nutrient, comparator: c.comparator, perMealValue: c.perMealValue, dailyValue: c.dailyValue as number | null, severity: c.severity, message: c.message, evidenceSource: c.evidenceSource, isActive: true };
    if (existing) await db.diseaseConstraint.update({ where: { id: existing.id }, data });
    else await db.diseaseConstraint.create({ data });
  }

  // Templates
  for (const t of TEMPLATES) {
    const data = {
      id: t.id,
      name: t.name,
      description: t.description,
      mealSlots: JSON.stringify(t.slots),
      dietTags: JSON.stringify(t.diets),
      items: JSON.stringify(t.items),
      cuisine: t.cuisine ?? "general",
      isActive: true,
    };
    await db.mealTemplate.upsert({ where: { id: t.id }, update: data, create: data });
  }

  // Demo user + profile
  const demo = await db.user.upsert({
    where: { email: DEMO_EMAIL },
    update: {},
    create: {
      id: "demo-user",
      email: DEMO_EMAIL,
      name: "Demo User",
      passwordHash: hashPassword(DEMO_PASSWORD),
      profile: {
        create: {
          age: 34, sex: "male", heightCm: 172, weightKg: 74,
          activityLevel: "moderate", goal: "maintain",
          dietaryPreference: "vegetarian",
          allergies: JSON.stringify(["peanuts"]),
          healthConditions: JSON.stringify(["T2DM"]),
          language: "en",
        },
      },
    },
  });

  console.log(`Seeded ${FOODS.length} foods, ${EVIDENCE.length} evidence docs, ${CONSTRAINTS.length} constraints, ${TEMPLATES.length} templates.`);
  console.log(`Demo user: ${DEMO_EMAIL} / ${DEMO_PASSWORD} (id=${demo.id})`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
