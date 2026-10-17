import { Category } from '../models/Category.js'
import { HeroSlide } from '../models/HeroSlide.js'
import { SiteSettings } from '../models/SiteSettings.js'
import { resolveHomeSections } from '../services/siteSettings.js'

const IMG = '/images/placeholder'

// What the shop starts with. After that, everything here is changed in the admin.
export const defaultCategories = [
  {
    slug: 'jamdani',
    name: 'Tangail Jamdani',
    nameBangla: 'টাঙ্গাইলের জামদানি',
    intro: 'Handwoven on traditional looms in Tangail. Each sari is one of a kind, with natural variations that mark it as made by hand.',
    banner: `${IMG}/category-jamdani.jpg`,
    status: 'live',
    inNav: true,
    order: 10,
    template: 'saree',
    types: [],
  },
  {
    slug: 'jewellery',
    name: 'Handmade Jewellery',
    nameBangla: 'গয়না',
    intro: 'Carved wood and handcrafted pieces, made to be worn with your Jamdani.',
    banner: '',
    status: 'coming-soon',
    inNav: true,
    order: 20,
    template: 'general',
    types: [
      { slug: 'wood', label: 'Wood' },
      { slug: 'carved', label: 'Carved' },
      { slug: 'handmade', label: 'Handmade' },
    ],
  },
]

export const defaultSlides = [
  {
    image: `${IMG}/hero-loom-red.jpg`,
    imageAlt: 'A red Jamdani sari being woven by hand on the loom',
    eyebrow: 'Handwoven in Tangail',
    title: 'Woven slowly,',
    titleAccent: 'worn for generations',
    bangla: 'টাঙ্গাইলের জামদানি',
    text: 'Each Jamdani is woven by hand, motif by motif, on a traditional loom. No two are ever quite the same.',
    ctaLabel: 'Shop Jamdani',
    ctaLink: '/collections/jamdani',
    cta2Label: 'Our Story',
    cta2Link: '/our-story',
    overlay: 45,
    align: 'left',
    order: 10,
  },
  {
    image: `${IMG}/jamdani-rainbow.jpg`,
    imageAlt: 'A rainbow-striped Jamdani sari with a stepped border',
    eyebrow: 'New from the loom',
    title: 'Colour, thread',
    titleAccent: 'by thread',
    bangla: 'নতুন সংগ্রহ',
    text: 'Fresh pieces from master weavers in Pathrail, Tangail.',
    ctaLabel: 'New Arrivals',
    ctaLink: '/collections/new',
    overlay: 50,
    align: 'left',
    order: 20,
  },
]

export const defaultAnnouncement = ['Cash on delivery across Bangladesh', 'Free delivery inside Dhaka']

// Adds any missing default category. Existing ones are never changed.
export async function ensureDefaultCategories() {
  await Category.bulkWrite(
    defaultCategories.map((c) => ({ updateOne: { filter: { slug: c.slug }, update: { $setOnInsert: c }, upsert: true } })),
  )
}

// Runs at server start. Fills an empty database once; the settings document marks it as done,
// so slides or categories the admin deletes later don't come back.
export async function ensureSiteDefaults() {
  if (await SiteSettings.exists({ key: 'site' })) return false
  await ensureDefaultCategories()
  if (!(await HeroSlide.exists({}))) await HeroSlide.insertMany(defaultSlides)
  await SiteSettings.updateOne(
    { key: 'site' },
    { $setOnInsert: { announcement: defaultAnnouncement, homeSections: resolveHomeSections() } },
    { upsert: true },
  )
  return true
}
