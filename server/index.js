import express from 'express'
import { db } from './db.js'

const app = express()
app.use(express.json())

// ===== 初始化种子数据（仅首次） =====
function seed() {
  const hasPlayer = db.prepare('SELECT COUNT(*) c FROM player').get().c
  if (hasPlayer > 0) return

  db.prepare('INSERT INTO player (id,name) VALUES (1,?)').run('小农夫')

  const crops = [
    ['萝卜', 3, 0, 8, 2, '🥕'],
    ['番茄', 5, 0, 15, 4, '🍅'],
    ['玉米', 6, 1, 20, 5, '🌽'],
    ['南瓜', 7, 2, 30, 8, '🎃'],
    ['小麦', 5, 0, 12, 3, '🌾'],
    ['白菜', 4, 2, 10, 3, '🥬']
  ]
  const cropIns = db.prepare('INSERT INTO crops VALUES (?,?,?,?,?,?,?)')
  crops.forEach((c, i) => cropIns.run(i + 1, ...c))

  // 初始 6x6 农田 + 出售地基信息见前端
  const plotIns = db.prepare('INSERT INTO plots (x,y) VALUES (?,?)')
  for (let x = 0; x < 6; x++) for (let y = 0; y < 6; y++) plotIns.run(x, y)

  db.prepare('INSERT INTO inventory (item_id,name,cat,qty) VALUES (?,?,?,?)')
    .run('seed-1', '萝卜种子', 'seed', 10)
  db.prepare('INSERT INTO inventory (item_id,name,cat,qty) VALUES (?,?,?,?)')
    .run('gold_seed_5', '小麦种子', 'seed', 5)

  const buildings = [
    ['农舍', 1, 0, 7, '你的家，升级可解锁新功能'],
    ['加工坊', 1, 7, 0, '将作物加工为制品出售'],
    ['畜棚', 1, 8, 7, '养殖动物，产出蛋奶毛'],
    ['市场', 1, 7, 6, '出售作物与制品']
  ]
  const bIns = db.prepare('INSERT INTO buildings VALUES (?,?,?,?,?,?)')
  buildings.forEach((b, i) => bIns.run(i + 1, ...b))
}
seed()

// ===== 通用查询辅助 =====
const q = (sql, ...p) => db.prepare(sql).all(...p)
const q1 = (sql, ...p) => db.prepare(sql).get(...p)
const run = (sql, ...p) => db.prepare(sql).run(...p)

// ===== 天气系统 =====
// 按季节加权随机生成天气事件；灾害约 35%，利好约 20%
const WEATHER = {
  0: [ // 春
    { type: 'sunny', name: '晴朗', icon: '🌤️', kind: 'normal', w: 35, desc: '风和日丽，适合作物生长。' },
    { type: 'spring_rain', name: '春雨', icon: '🌧️', kind: 'good', w: 25, desc: '春雨贵如油：全部地块水分补满。' },
    { type: 'late_frost', name: '倒春寒', icon: '🥶', kind: 'disaster', w: 20, desc: '未防护时：作物可能冻伤退化，光照下降。' },
    { type: 'pest_outbreak', name: '虫害爆发', icon: '🐛', kind: 'disaster', w: 20, desc: '未防护时：全部地块虫害加重。' }
  ],
  1: [ // 夏
    { type: 'sunny', name: '晴朗', icon: '☀️', kind: 'normal', w: 30, desc: '阳光充足。' },
    { type: 'heatwave', name: '高温', icon: '🔥', kind: 'disaster', w: 25, desc: '未防护时：地块水分大量蒸发。' },
    { type: 'storm', name: '暴雨', icon: '⛈️', kind: 'disaster', w: 25, desc: '水分补满，但未防护时作物可能被冲毁。' },
    { type: 'drought', name: '干旱', icon: '🏜️', kind: 'disaster', w: 20, desc: '未防护时：地块水分、肥力严重流失。' }
  ],
  2: [ // 秋
    { type: 'sunny', name: '晴朗', icon: '🌤️', kind: 'normal', w: 30, desc: '秋高气爽。' },
    { type: 'harvest_sun', name: '丰收晴日', icon: '🌞', kind: 'good', w: 25, desc: '光照补满，作物额外加速生长。' },
    { type: 'wind', name: '大风', icon: '💨', kind: 'disaster', w: 25, desc: '未防护时：作物可能被吹伤退化。' },
    { type: 'early_frost', name: '早霜', icon: '🌨️', kind: 'disaster', w: 20, desc: '未防护时：作物可能冻伤退化，光照下降。' }
  ],
  3: [ // 冬
    { type: 'snow', name: '小雪', icon: '🌨️', kind: 'normal', w: 35, desc: '瑞雪兆丰年。' },
    { type: 'warm_winter', name: '暖冬', icon: '🌥️', kind: 'good', w: 25, desc: '暖冬怡人：动物恢复健康。' },
    { type: 'blizzard', name: '暴雪', icon: '❄️', kind: 'disaster', w: 20, desc: '未防护时：动物健康与饱食大幅下降。' },
    { type: 'freeze', name: '严寒', icon: '🧊', kind: 'disaster', w: 20, desc: '未防护时：动物受冻，地块光照下降。' }
  ]
}

// 为指定绝对日生成天气（INSERT OR IGNORE：同一天永远只生成一次，读档/重试不会重复）
function ensureWeather(absDay, season, day) {
  const list = WEATHER[season % 4]
  const total = list.reduce((s, w) => s + w.w, 0)
  let r = Math.random() * total
  let pick = list[0]
  for (const w of list) { r -= w.w; if (r <= 0) { pick = w; break } }
  db.prepare('INSERT OR IGNORE INTO weather_events (abs_day,season,day,type,name,icon,kind,"desc") VALUES (?,?,?,?,?,?,?,?)')
    .run(absDay, season, day, pick.type, pick.name, pick.icon, pick.kind, pick.desc)
}

// 应用当天天气效果，返回结算描述（prot=true 表示防护生效，免疫灾害损失）
function applyWeather(w, prot) {
  const effects = []
  const plots = q('SELECT * FROM plots WHERE crop_id IS NOT NULL')
  const animals = q('SELECT * FROM animals')
  const t = w.type
  if (t === 'spring_rain') {
    run('UPDATE plots SET water=100')
    effects.push('春雨滋润，全部地块水分补满')
  } else if (t === 'harvest_sun') {
    run('UPDATE plots SET light=100')
    let n = 0
    for (const pl of plots) {
      const crop = q1('SELECT days FROM crops WHERE id=?', pl.crop_id)
      if (crop && pl.stage < crop.days - 1) { run('UPDATE plots SET stage=stage+1 WHERE id=?', pl.id); n++ }
    }
    effects.push(n ? `光照补满，${n} 块地作物加速生长` : '光照补满')
  } else if (t === 'warm_winter') {
    if (animals.length) { run('UPDATE animals SET health=MIN(100, health+12)'); effects.push('暖冬怡人，动物健康 +12') }
    else effects.push('暖冬怡人')
  } else if (w.kind === 'disaster') {
    if (prot) {
      effects.push(`🛡️ 防护生效，${w.name}未造成损失`)
    } else if (t === 'late_frost' || t === 'early_frost') {
      let hurt = 0
      for (const pl of plots) {
        if (pl.stage > 0 && Math.random() < 0.3) { run('UPDATE plots SET stage=stage-1 WHERE id=?', pl.id); hurt++ }
      }
      run('UPDATE plots SET light=MAX(0, light-20)')
      effects.push(hurt ? `${hurt} 块地作物冻伤退化，光照 -20` : '光照 -20，作物幸免于难')
    } else if (t === 'pest_outbreak') {
      run('UPDATE plots SET pest=pest+2')
      effects.push('全部地块虫害 +2')
    } else if (t === 'heatwave') {
      run('UPDATE plots SET water=MAX(0, water-35)')
      effects.push('高温蒸发，全部地块水分 -35')
    } else if (t === 'drought') {
      run('UPDATE plots SET water=MAX(0, water-45), fert=MAX(0, fert-10)')
      effects.push('干旱肆虐，全部地块水分 -45、肥力 -10')
    } else if (t === 'storm') {
      run('UPDATE plots SET water=100')
      let lost = 0
      for (const pl of plots) {
        if (Math.random() < 0.1) {
          run('UPDATE plots SET crop_id=NULL, stage=-1, planted_day=NULL, planted_season=NULL WHERE id=?', pl.id)
          lost++
        }
      }
      effects.push(lost ? `暴雨冲毁了 ${lost} 块地的作物！` : '暴雨倾盆，水分补满，作物幸免于难')
    } else if (t === 'wind') {
      let hurt = 0
      for (const pl of plots) {
        if (pl.stage > 0 && Math.random() < 0.2) { run('UPDATE plots SET stage=stage-1 WHERE id=?', pl.id); hurt++ }
      }
      effects.push(hurt ? `大风吹伤 ${hurt} 块地作物，生长倒退` : '大风呼啸，作物幸免于难')
    } else if (t === 'blizzard') {
      if (animals.length) { run('UPDATE animals SET health=MAX(0, health-18), feed=MAX(0, feed-10)'); effects.push('暴雪封门，动物健康 -18、饱食 -10') }
      else effects.push('暴雪封门')
    } else if (t === 'freeze') {
      if (animals.length) run('UPDATE animals SET health=MAX(0, health-12)')
      run('UPDATE plots SET light=MAX(0, light-15)')
      effects.push('严寒刺骨，动物健康 -12，地块光照 -15')
    }
  }
  return effects
}

// 启动时确保“今天”已有天气记录（新档第 1 天 / 旧档迁移）
{
  const cur = q1('SELECT total_day, season, day FROM player WHERE id=1')
  ensureWeather(cur.total_day, cur.season, cur.day)
}

// ===== API =====
app.get('/api/state', (req, res) => {
  const player = q1('SELECT * FROM player WHERE id=1')
  res.json({
    player,
    crops: q('SELECT * FROM crops'),
    inventory: q('SELECT * FROM inventory'),
    buildings: q('SELECT * FROM buildings'),
    animals: q('SELECT * FROM animals'),
    plots: q('SELECT * FROM plots'),
    weather: q1('SELECT * FROM weather_events WHERE abs_day=?', player.total_day),
    weatherLog: q('SELECT * FROM weather_events ORDER BY abs_day DESC LIMIT 10')
  })
})

// 播种：plotId + cropId
app.post('/api/plant', (req, res) => {
  const { plotId, cropId } = req.body
  const plot = q1('SELECT * FROM plots WHERE id=?', plotId)
  const crop = q1('SELECT * FROM crops WHERE id=?', cropId)
  if (!plot || !crop) return res.status(404).json({ error: 'not found' })
  if (plot.crop_id) return res.status(400).json({ error: 'already planted' })
  const inv = q1("SELECT * FROM inventory WHERE item_id=? AND cat='seed'", 'seed-' + crop.id)
  const invById = q1("SELECT qty FROM inventory WHERE item_id=?", 'seed-' + crop.id)
  const stock = invById?.qty || 0
  if (stock <= 0) return res.status(400).json({ error: 'no seed' })
  run(`UPDATE plots SET crop_id=?, stage=0, water=100, fert=100, light=100, pest=0,
       planted_day=(SELECT day FROM player WHERE id=1), planted_season=(SELECT season FROM player WHERE id=1)
       WHERE id=?`, cropId, plotId)
  run(`UPDATE inventory SET qty=qty-1 WHERE item_id=?`, 'seed-' + crop.id)
  res.json({ ok: true })
})

// 浇水
app.post('/api/water', (req, res) => {
  const { plotId } = req.body
  run('UPDATE plots SET water=100 WHERE id=?', plotId)
  res.json({ ok: true })
})

// 施肥
app.post('/api/fertilize', (req, res) => {
  const { plotId } = req.body
  run('UPDATE plots SET fert=100 WHERE id=?', plotId)
  res.json({ ok: true })
})

// 除草/除虫
app.post('/api/clean', (req, res) => {
  const { plotId } = req.body
  run('UPDATE plots SET pest=0 WHERE id=?', plotId)
  res.json({ ok: true })
})

// 收获：返回作物，给钱（若成熟）
app.post('/api/harvest', (req, res) => {
  const { plotId } = req.body
  const plot = q1('SELECT * FROM plots WHERE id=?', plotId)
  if (!plot || !plot.crop_id) return res.status(404).json({ error: 'empty' })
  const crop = q1('SELECT * FROM crops WHERE id=?', plot.crop_id)
  const isFullGrown = isCropGrown(plot, crop)
  if (isFullGrown) {
    run('UPDATE player SET gold=gold+?, exp=exp+? WHERE id=1', crop.price, 3)
    // 得到作物 + 概率得种子
    addInv('crop-' + crop.id, crop.name, 'crop', 1)
    if (Math.random() < 0.25) addInv('seed-' + crop.id, crop.name + '种子', 'seed', 1)
    run('UPDATE plots SET crop_id=NULL, stage=-1, water=100, fert=100, light=100, pest=0, planted_day=NULL, planted_season=NULL WHERE id=?', plotId)
    return res.json({ ok: true, yield: crop.name, gold: crop.price })
  }
  return res.json({ ok: false, reason: 'not grown' })
})

// 时间推进 1 天（返回当天结算摘要）
app.post('/api/nextday', (req, res) => {
  res.json({ ok: true, days: [advanceDay()] })
})

// 时间推进多天（快速）：逐日独立事务结算，返回每日摘要
app.post('/api/skip', (req, res) => {
  const n = Math.min(Number(req.body?.n) || 1, 14)
  const days = []
  for (let i = 0; i < n; i++) days.push(advanceDay())
  res.json({ ok: true, days })
})

// 购买防灾物资（🪙8/个）
app.post('/api/buykit', (req, res) => {
  const n = Math.max(1, Math.min(Number(req.body?.qty) || 1, 99))
  const cost = 8 * n
  if (q1('SELECT gold FROM player WHERE id=1').gold < cost) return res.status(400).json({ error: '金币不足' })
  run('UPDATE player SET gold=gold-? WHERE id=1', cost)
  addInv('disaster_kit', '防灾物资', 'material', n)
  res.json({ ok: true, qty: n })
})

// 投入金币+物资购买防护：每天 🪙10 + 防灾物资×1，灾害天气免疫损失
const PROTECT_GOLD_PER_DAY = 10
app.post('/api/protect', (req, res) => {
  const want = Math.max(1, Math.min(Number(req.body?.days) || 1, 14))
  const kits = q1("SELECT qty FROM inventory WHERE item_id='disaster_kit'")?.qty || 0
  const gold = q1('SELECT gold FROM player WHERE id=1').gold
  const n = Math.min(want, kits, Math.floor(gold / PROTECT_GOLD_PER_DAY))
  if (n <= 0) return res.status(400).json({ error: '金币或防灾物资不足' })
  db.exec('BEGIN IMMEDIATE')
  try {
    run('UPDATE player SET gold=gold-?, protect_days=protect_days+? WHERE id=1', n * PROTECT_GOLD_PER_DAY, n)
    run("UPDATE inventory SET qty=qty-? WHERE item_id='disaster_kit'", n)
    cleanEmpty()
    db.exec('COMMIT')
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
  res.json({ ok: true, days: n, cost: n * PROTECT_GOLD_PER_DAY })
})

// 买种子
app.post('/api/buyseed', (req, res) => {
  const { cropId, qty } = req.body
  const n = Math.max(1, Math.min(Number(qty) || 1, 99))
  const crop = q1('SELECT * FROM crops WHERE id=?', cropId)
  if (!crop) return res.status(404).json({ error: 'crop' })
  const cost = crop.seedPrice * n
  const p = q1('SELECT gold FROM player WHERE id=1')
  if (p.gold < cost) return res.status(400).json({ error: 'no gold' })
  run('UPDATE player SET gold=gold-? WHERE id=1', cost)
  addInv('seed-' + crop.id, crop.name + '种子', 'seed', n)
  res.json({ ok: true })
})

// 卖作物
app.post('/api/sellcrop', (req, res) => {
  const { cropId, qty } = req.body
  const n = Math.max(1, Math.min(Number(qty) || 1, 999))
  const crop = q1('SELECT * FROM crops WHERE id=?', cropId)
  const hold = q1("SELECT qty FROM inventory WHERE item_id=?", 'crop-' + crop.id)
  const stock = hold?.qty || 0
  const s = Math.min(n, stock)
  if (s <= 0) return res.status(400).json({ error: 'none' })
  const gain = crop.price * s
  run(`UPDATE inventory SET qty=qty-? WHERE item_id=?`, s, 'crop-' + crop.id)
  run('UPDATE player SET gold=gold+? WHERE id=1', gain)
  cleanEmpty()
  res.json({ ok: true, gain, sold: s })
})

// 领养动物
app.post('/api/animal', (req, res) => {
  const { species } = req.body
  const cfg = { chicken: { name: '母鸡', cost: 30 }, cow: { name: '奶牛', cost: 80 }, sheep: { name: '绵羊', cost: 60 } }
  const c = cfg[species]
  if (!c) return res.status(400).json({ error: 'species' })
  const p = q1('SELECT gold FROM player WHERE id=1')
  if (p.gold < c.cost) return res.status(400).json({ error: 'no gold' })
  run('UPDATE player SET gold=gold-? WHERE id=1', c.cost)
  const x = 8 + (q('SELECT COUNT(*) c FROM animals').length) % 3
  const r = run('INSERT INTO animals (name,species,x,y) VALUES (?,?,?,?)', c.name + '#' + (Date.now() % 1000), species, x, 8)
  res.json({ ok: true, id: r.lastInsertRowid })
})

// 喂食
app.post('/api/feed', (req, res) => {
  const { id } = req.body
  run('UPDATE animals SET feed=100 WHERE id=?', id)
  res.json({ ok: true })
})

// 收集动物产物
app.post('/api/collect', (req, res) => {
  const { id } = req.body
  const a = q1('SELECT * FROM animals WHERE id=?', id)
  if (!a || !a.ready) return res.status(400).json({ error: 'not ready' })
  const prod = { chicken: ['鸡蛋', 6], cow: ['牛奶', 12], sheep: ['羊毛', 10] }[a.species]
  addInv('p-' + a.species, prod[0], 'product', 1)
  const gain = Math.round(prod[1] / 2)
  run('UPDATE player SET gold=gold+? WHERE id=1', gain)
  run('UPDATE animals SET ready=0 WHERE id=?', id)
  res.json({ ok: true, item: prod[0], gold: gain })
})

// 加工作物
app.post('/api/process', (req, res) => {
  const { from, result, consume, gain } = req.body
  const hold = q1('SELECT qty FROM inventory WHERE item_id=?', from)
  const stock = hold?.qty || 0
  if (stock < consume) return res.status(400).json({ error: 'not enough' })
  run(`UPDATE inventory SET qty=qty-? WHERE item_id=?`, consume, from)
  addInv(result.id, result.name, result.cat, gain)
  cleanEmpty()
  res.json({ ok: true })
})

// 升级建筑
app.post('/api/upgrade', (req, res) => {
  const { id } = req.body
  const b = q1('SELECT * FROM buildings WHERE id=?', id)
  if (!b || b.level >= 5) return res.status(400).json({ error: 'max' })
  const cost = 40 * b.level
  if (q1('SELECT gold FROM player WHERE id=1').gold < cost) return res.status(400).json({ error: 'no gold' })
  run('UPDATE player SET gold=gold-? WHERE id=1', cost)
  run('UPDATE buildings SET level=level+1 WHERE id=?', id)
  res.json({ ok: true, level: b.level + 1 })
})

// ===== 工具函数 =====
function addInv(itemId, name, cat, n) {
  const row = q1('SELECT qty FROM inventory WHERE item_id=?', itemId)
  if (row) run('UPDATE inventory SET qty=qty+? WHERE item_id=?', n, itemId)
  else run('INSERT INTO inventory (item_id,name,cat,qty) VALUES (?,?,?,?)', itemId, name, cat, n)
}
function cleanEmpty() {
  db.exec('DELETE FROM inventory WHERE qty<=0')
}
function isCropGrown(plot, crop) {
  return plot.stage >= (crop.days - 1)
}
// 推进一天：整个结算（生长、天气、防护消耗、季节轮转）在一个事务内完成。
// total_day 单调递增 + weather_events.abs_day 唯一约束，保证同一天只结算一次，
// 读档（GET /api/state）只是查询，重试本接口也只会推进到“新的一天”，不会重复扣损。
function advanceDay() {
  db.exec('BEGIN IMMEDIATE')
  try {
    const p = q1('SELECT * FROM player WHERE id=1')
    let day = p.day + 1
    let season = p.season
    if (day > 28) { day = 1; season = (season + 1) % 4 }
    const absDay = p.total_day + 1

    // 1) 生成并持久化当天天气（幂等）
    ensureWeather(absDay, season, day)
    const weather = q1('SELECT * FROM weather_events WHERE abs_day=?', absDay)

    // 2) 防护按天消耗
    let protectedToday = false
    if (p.protect_days > 0) {
      protectedToday = true
      run('UPDATE player SET protect_days=protect_days-1 WHERE id=1')
    }

    // 3) 常规逐日变化：地块生长 + 四维消耗 + 虫害
    const plots = q('SELECT * FROM plots')
    for (const pl of plots) {
      if (!pl.crop_id) continue
      const water = Math.max(0, pl.water - (12 + Math.round(Math.random() * 12)))
      const fert = Math.max(0, pl.fert - (8 + Math.round(Math.random() * 8)))
      let light = Math.max(0, pl.light - (6 + Math.round(Math.random() * 8)))
      if (season === 3) light = Math.max(0, light - 10) // 冬季光照下降
      const pest = pl.pest + (Math.random() < 0.25 ? 1 : 0)
      const flux = water >= 30 && fert >= 30 && light >= 30 && pest <= 0.6
      const crop = q1('SELECT days FROM crops WHERE id=?', pl.crop_id)
      const full = pl.stage >= (crop.days - 1)
      let stage = pl.stage
      if (!full && flux) stage += 1
      run(`UPDATE plots SET water=?,fert=?,light=?,pest=?,stage=? WHERE id=?`, water, fert, light, pest, stage, pl.id)
    }
    // 动物喂食衰减 + 产物就绪
    const animals = q('SELECT * FROM animals')
    for (const a of animals) {
      const feed = Math.max(0, a.feed - 25)
      const health = Math.max(0, a.health - (feed === 0 ? 20 : 6))
      run(`UPDATE animals SET feed=?,health=?,ready=1 WHERE id=?`, feed, health, a.id)
    }

    // 4) 天气效果（损失 / 防护 / 恢复）
    const effects = applyWeather(weather, protectedToday)

    // 5) 天数推进与季节轮转
    run('UPDATE player SET day=?, season=?, total_day=? WHERE id=1', day, season, absDay)
    db.exec('COMMIT')
    return { absDay, day, season, weather, protected: protectedToday, effects }
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
}

const PORT = 4110
app.listen(PORT, () => console.log(`[FARM] API running at http://localhost:${PORT}`))