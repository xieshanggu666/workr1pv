<template>
  <div class="tabs">
    <button v-for="t in tabs" :key="t.key" :class="{active:tab===t.key}" @click="tab=t.key">{{ t.label }}</button>
  </div>

  <!-- 市场 -->
  <div v-if="tab==='market'" class="page">
    <div class="pcol card">
      <h4>🌾 种子商店</h4>
      <div class="row" v-for="c in store.crops" :key="c.id">
        <span class="i">{{ c.sprite }}</span>
        <div class="m-info">
          <b>{{ c.name }}</b>
          <span class="tag season s{{c.season}}">宜{{['春','夏','秋','冬'][c.season]}}</span>
          <span class="tag">{{ c.days }}天成熟</span>
        </div>
        <span class="price seed">🪙{{ c.seedPrice }}</span>
        <button class="mini" @click="store.buySeed(c.id,1)">买</button>
        <button class="mini" @click="store.buySeed(c.id,5)">买×5</button>
      </div>
    </div>
    <div class="pcol card">
      <h4>💰 出售作物</h4>
      <div v-if="!sellable.length" class="none">暂无库存，请先收获作物</div>
      <div class="row" v-for="s in sellable" :key="s.item_id">
        <span class="i">{{ s.icon }}</span>
        <div class="m-info"><b>{{ s.name }}</b><span class="tag">×{{ s.qty }}</span></div>
        <span class="price">🪙{{ s.unit }} /个</span>
        <button class="mini green" @click="store.sellCrop(s.cropId,1)">卖1</button>
        <button class="mini green" @click="store.sellCrop(s.cropId,5)">卖5</button>
      </div>
    </div>
  </div>

  <!-- 加工坊 -->
  <div v-if="tab==='process'" class="page">
    <div class="pcol card">
      <h4>⚙️ 加工坊 <span class="lvl">Lv.{{ mill.level }}</span></h4>
      <div class="row" v-for="r in recipes" :key="r.id">
        <span class="i">🛠️</span>
        <div class="m-info">
          <b>{{ r.name }}</b>
          <span class="tag">消耗 {{ r.consume }} {{ r.need }}</span>
          <span class="tag">→ {{ r.result.name }} ×{{ r.gain }}</span>
        </div>
        <button class="mini" @click="doProcess(r)">加工</button>
      </div>
      <button class="wide" @click="store.upgradeBuilding(mill.id)">🔧 升级加工坊（🪙{{ mill.level*40 }}）→ 解锁更多配方</button>
    </div>
  </div>

  <!-- 畜棚 -->
  <div v-if="tab==='barn'" class="page">
    <div class="pcol card">
      <h4>🐖 畜棚 <span class="lvl">Lv.{{ barn.level }}</span></h4>
      <div class="adopt">
        <button class="ad" @click="store.buyAnimal('chicken')">🐔 母鸡 <span>🪙30</span></button>
        <button class="ad" @click="store.buyAnimal('sheep')">🐑 绵羊 <span>🪙60</span></button>
        <button class="ad" @click="store.buyAnimal('cow')">🐄 奶牛 <span>🪙80</span></button>
      </div>
      <div class="animal-list">
        <div v-if="!store.animals.length" class="none">还没有动物，请领养</div>
        <div v-for="a in store.animals" :key="a.id" class="animal">
          <span class="a-icon">{{ {chicken:'🐔',sheep:'🐑',cow:'🐄'}[a.species] }}</span>
          <div class="m-info">
            <b>{{ a.name }}</b>
            <div class="hp">
              <div class="bar"><i :style="{width:a.feed+'%',background:a.feed<40?'#ef5350':'#4caf50'}"></i></div>
              <span class="tiny">食{{ Math.round(a.feed) }}</span>
            </div>
            <div class="hp"><div class="bar"><i :style="{width:a.health+'%',background:healthColor}"></i></div><span class="tiny">健{{ Math.round(a.health) }}</span></div>
          </div>
          <span class="ready" v-if="a.ready">可收集</span>
          <button class="mini" @click="store.feedAnimal(a.id)">🥣 喂食</button>
          <button class="mini green" :disabled="!a.ready" @click="store.collectAnimal(a.id)">🧺 收集</button>
        </div>
      </div>
      <button class="wide" @click="store.upgradeBuilding(barn.id)">🔧 升级畜棚（🪙{{ barn.level*40 }}）</button>
    </div>
  </div>

  <!-- 背包 -->
  <div v-if="tab==='bag'" class="page">
    <div class="pcol card">
      <h4>🎒 我的背包</h4>
      <div v-if="!store.inventory.length" class="none">背包空空如也</div>
      <div class="grid">
        <div v-for="it in store.inventory" :key="it.item_id" class="bag-item">
          <span class="b-icon">{{ iconOf(it) }}</span>
          <span class="b-name">{{ it.name }}</span>
          <span class="b-qty">×{{ it.qty }}</span>
          <span class="b-cat">{{ catName(it.cat) }}</span>
        </div>
      </div>
    </div>
  </div>

  <!-- 天气与防灾 -->
  <div v-if="tab==='weather'" class="page">
    <div class="pcol card">
      <h4>🌦️ 今日天气</h4>
      <div v-if="store.weather" class="w-now" :class="store.weather.kind">
        <span class="w-icon">{{ store.weather.icon }}</span>
        <div class="w-info">
          <b>{{ store.weather.name }}
            <span class="w-kind" :class="store.weather.kind">{{ {good:'利好',normal:'平常',disaster:'灾害'}[store.weather.kind] }}</span>
          </b>
          <p>{{ store.weather.desc }}</p>
        </div>
      </div>
      <div class="protect-box">
        <div class="p-line">🛡️ 防护剩余 <b class="p-days">{{ store.player?.protect_days ?? 0 }}</b> 天</div>
        <p class="p-tip">防护期间灾害天气零损失，每过一天消耗 1 天防护。购买防护：每天 🪙10 + 防灾物资×1。</p>
        <div class="p-btns">
          <button class="mini" @click="store.protect(1)">防护 1 天</button>
          <button class="mini" @click="store.protect(3)">防护 3 天</button>
          <button class="mini" @click="store.protect(7)">防护 7 天</button>
        </div>
        <div class="kit-line">
          🧰 防灾物资库存 <b>{{ kitQty }}</b> 个
          <button class="mini green" @click="store.buyKit(1)">买 1（🪙8）</button>
          <button class="mini green" @click="store.buyKit(5)">买 5（🪙40）</button>
        </div>
      </div>
    </div>
    <div class="pcol card">
      <h4>📜 天气记录</h4>
      <div v-if="!store.weatherLog.length" class="none">暂无记录</div>
      <div class="row" v-for="w in store.weatherLog" :key="w.abs_day">
        <span class="i">{{ w.icon }}</span>
        <div class="m-info">
          <b>第 {{ w.day }} 天 · {{ w.name }}</b>
          <span class="tag" :class="'k-'+w.kind">{{ {good:'利好',normal:'平常',disaster:'灾害'}[w.kind] }}</span>
          <span class="desc">{{ w.desc }}</span>
        </div>
      </div>
    </div>
  </div>

  <!-- 建筑 -->
  <div v-if="tab==='build'" class="page">
    <div class="pcol card">
      <h4>🏠 建筑一览</h4>
      <div class="row" v-for="b in store.buildings" :key="b.id">
        <span class="i">🏠</span>
        <div class="m-info"><b>{{ b.name }}</b><span class="tag">Lv.{{ b.level }}</span><span class="desc">{{ b.desc }}</span></div>
        <button class="mini" @click="store.upgradeBuilding(b.id)">升级</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useGameStore } from '@/store/game'
const store = useGameStore()
const tab = ref('market')
const healthColor = '#4caf50'

const tabs = [
  { key: 'market', label: '🏪 市场' },
  { key: 'process', label: '⚙️ 加工坊' },
  { key: 'barn', label: '🐖 畜棚' },
  { key: 'weather', label: '🌦️ 天气' },
  { key: 'bag', label: '🎒 背包' },
  { key: 'build', label: '🏠 建筑' }
]

const kitQty = computed(() => store.inventory.find((it) => it.item_id === 'disaster_kit')?.qty || 0)

const cropIcon = computed(() => {
  const m = {}
  store.crops.forEach((c) => { m[c.id] = c.sprite })
  return m
})
const sellable = computed(() =>
  store.inventory
    .filter((it) => it.cat === 'crop')
    .map((it) => {
      const id = it.item_id.split('-')[1]
      const crop = store.crops.find((c) => c.id === Number(id)) || { id: 0, price: 1 }
      return { ...it, icon: cropIcon.value[id] || '🧺', unit: crop.price, cropId: crop.id }
    })
)
function catName(c) { return { seed: '种子', crop: '作物', product: '制品', material: '材料' }[c] || c }
function iconOf(it) {
  if (it.cat === 'crop') return cropIcon.value[it.item_id.split('-')[1]] || '🧺'
  if (it.cat === 'seed') return '🌱'
  if (it.cat === 'product') { return { 'p-chicken': '🥚', 'p-cow': '🥛', 'p-sheep': '🧶' }[it.item_id] || '📦' }
  return { flour: '🌾制品', juice: '🧃', cheese: '🧀', wool1: '🧵' }[it.item_id] || '📦'
}
const mill = computed(() => store.buildings.find((b) => b.name === '加工坊'))
const barn = computed(() => store.buildings.find((b) => b.name === '畜棚'))

const recipes = computed(() => {
  // 基础配方始终可用；随等级解锁更多
  const lv = mill.value?.level || 1
  const arr = [
    { id: 'flower', need: '小麦作物', consume: 2, from: 'crop-5', result: { id: 'flour', name: '面粉', cat: 'material' }, gain: 1 },
    { id: 'juice', need: '番茄作物', consume: 2, from: 'crop-2', result: { id: 'juice', name: '番茄汁', cat: 'product' }, gain: 1 },
    { id: 'cheese', need: '牛奶', consume: 2, from: 'p-cow', result: { id: 'cheese', name: '奶酪', cat: 'product' }, gain: 1 }
  ]
  if (lv >= 2) arr.push({ id: 'bread', need: '面粉', consume: 2, from: 'flour', result: { id: 'bread', name: '面包', cat: 'product' }, gain: 1 })
  if (lv >= 3) arr.push({ id: 'cloth', need: '羊毛', consume: 1, from: 'p-sheep', result: { id: 'wool', name: '毛线', cat: 'product' }, gain: 1 })
  return arr
})
function doProcess(r) {
  store.processBuild(r.from, r.result, r.consume, r.gain)
}
</script>

<style scoped>
.tabs { display:flex;gap:6px;margin-bottom:14px; }
.tabs button { background:#13233f;border:1px solid rgba(120,160,220,0.2);color:#aebadd;padding:8px 14px;border-radius:8px;cursor:pointer;font-size:13px; }
.tabs button.active { background:linear-gradient(135deg,#1d3f8f,#2962ff);color:#fff;border-color:transparent; }
.page { display:grid;grid-template-columns:1fr 1fr;gap:16px; }
@media(max-width:760px){ .page{grid-template-columns:1fr;} }
.pcol { display:flex;flex-direction:column;gap:2px; }
.card { background:#0f1b38;border:1px solid rgba(120,160,220,0.16);border-radius:12px;padding:16px; }
h4 { margin:0 0 8px;color:#fff;display:flex;gap:8px;align-items:center; }
.lvl { font-size:11px;color:#ffd54f; }
.row { display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px dashed rgba(120,160,220,0.1); }
.row:last-child{border-bottom:none;}
.i { font-size:22px;width:30px;text-align:center; }
.m-info { flex:1;min-width:0;display:flex;flex-wrap:wrap;gap:4px;align-items:center; }
.m-info b { color:#e8eefb;font-size:13px;width:100%; }
.tag { font-size:10px;color:#6f84ab;background:#16263f;padding:2px 6px;border-radius:4px; }
.tag.s0,.s.spring{ color:#a5d6a7; } .s1{color:#90caf9;} .s2{color:#ffe082;} .s3{color:#b39ddb;}
.desc { font-size:10px;color:#8ba2c8;width:100%; }
.price { color:#ffc107;font-size:12px;font-weight:600;white-space:nowrap; }
.price.seed { color:#ffb300; }
.mini { background:#2962ff;border:none;color:#fff;border-radius:7px;padding:6px 10px;font-size:12px;cursor:pointer; }
.mini.green { background:#43a047; }
.mini:disabled{background:#2a3a5e;color:#6f84ab;cursor:not-allowed;}
.wide { width:100%;margin-top:12px;background:#16263f;border:1px solid rgba(255,213,79,0.3);color:#ffd54f;border-radius:9px;padding:10px;font-size:13px;cursor:pointer; }
.none { color:#5b6f94;text-align:center;padding:20px;font-size:12px; }
.adopt { display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap; }
.ad { flex:1;min-width:90px;background:#16263f;border:1px solid rgba(120,160,220,0.2);border-radius:9px;padding:10px;color:#dbe4f3;cursor:pointer;font-size:12px;display:flex;flex-direction:column;align-items:center;gap:4px; }
.ad span { color:#ffc107;font-size:11px; }
.animal { display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px dashed rgba(120,160,220,0.1); }
.a-icon{font-size:20px;}
.hp{display:flex;align-items:center;gap:4px;}
.hp .bar{flex:1;height:5px;background:#0c1730;border-radius:3px;overflow:hidden;width:90px;}
.hp .bar i{display:block;height:100%;}
.tiny{font-size:9px;color:#8ba2c8;width:26px;}
.ready{color:#ffd54f;font-size:11px;}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px;}
.bag-item{background:#16263f;border:1px solid rgba(120,160,220,0.12);border-radius:9px;padding:10px;display:flex;flex-direction:column;align-items:center;gap:3px;font-size:12px;color:#dbe4f3;}
.b-icon{font-size:22px;}
.b-qty{color:#ffd54f;}
.b-cat{font-size:9px;color:#6f84ab;}
.w-now{display:flex;gap:12px;align-items:center;background:#16263f;border-radius:10px;padding:12px;border:1px solid rgba(120,160,220,0.15);}
.w-now.disaster{border-color:rgba(239,83,80,0.45);}
.w-now.good{border-color:rgba(76,175,80,0.45);}
.w-icon{font-size:34px;}
.w-info b{color:#fff;font-size:14px;display:flex;align-items:center;gap:8px;}
.w-info p{margin:4px 0 0;font-size:11px;color:#8ba2c8;}
.w-kind{font-size:10px;padding:2px 6px;border-radius:4px;background:#16263f;color:#6f84ab;}
.w-kind.disaster{background:#4a1f1f;color:#ef9a9a;}
.w-kind.good{background:#1b3a24;color:#a5d6a7;}
.protect-box{margin-top:12px;background:#13233f;border:1px dashed rgba(128,222,234,0.35);border-radius:10px;padding:12px;}
.p-line{color:#dbe4f3;font-size:13px;}
.p-days{color:#80deea;font-size:16px;}
.p-tip{font-size:11px;color:#8ba2c8;margin:6px 0 10px;}
.p-btns{display:flex;gap:8px;flex-wrap:wrap;}
.kit-line{margin-top:10px;font-size:12px;color:#dbe4f3;display:flex;align-items:center;gap:8px;flex-wrap:wrap;}
.kit-line b{color:#ffd54f;}
.tag.k-disaster{color:#ef9a9a;} .tag.k-good{color:#a5d6a7;} .tag.k-normal{color:#6f84ab;}
</style>