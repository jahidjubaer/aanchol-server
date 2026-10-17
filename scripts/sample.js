// npm run sample:add                     →  demo products, customer, orders and a (switched-off) campaign
// npm run sample:add -- --campaign-live  →  same, with the sample 10% campaign actually running
// npm run sample:remove                  →  deletes every sample document before launch
// Works on the database in MONGODB_URI. Real products, orders and customers are never touched.
import { env } from '../src/config/env.js'
import { connectDb, disconnectDb } from '../src/db.js'
import { addSampleData, removeSampleData } from '../src/seed/sample.js'

const [command] = process.argv.slice(2)
await connectDb(env.mongoUri())

if (command === 'add') {
  const result = await addSampleData({
    campaignLive: process.argv.includes('--campaign-live'),
    customerPassword: process.env.SAMPLE_CUSTOMER_PASSWORD,
  })
  console.log(`Added ${result.products} sample products and ${result.orders} sample orders.`)
  console.log(`Sample campaign: ${result.campaignLive ? 'running (prices are 10% off!)' : 'added but switched off (turn on in Admin → Campaigns)'}.`)
  console.log(`Sample customer login: ${result.customerPhone} / ${result.customerPassword}`)
} else if (command === 'remove') {
  const r = await removeSampleData()
  console.log(`Removed ${r.products} products, ${r.orders} orders, ${r.customers} customers, ${r.campaigns} campaigns, ${r.giftCards} gift cards (all sample).`)
} else {
  console.log('Use: npm run sample:add  or  npm run sample:remove')
}
await disconnectDb()
