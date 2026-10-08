import { useEffect, useRef, useState } from 'react'
import { TITLES } from '../titles'
import {
  BEER_FULL, BELL_CURE, BUG_FREE_MS, BUG_MAX, BUG_STAY_MS, DIFFICULTY, EXTEND_SEC, FEVER_SEC, GAME_SEC,
  GERO_PENALTY, ITEMS, POISON_GERO, POISON_TIME_SEC, SAKE_GERO, SHIME_SEC, SPECIAL_FEVER_MULT,
  TSUKIDASHI_SEC, WATER_GERO, TITLE_MIN_PT,
} from '../constants'
import { RANK_MAX, RANK_MIN_PT, beersForRank, feverBonusSec } from '../rank'

const TOC = [
  { id: 'basic', label: '基本ルール' },
  { id: 'screen', label: 'ゲーム画面の見かた' },
  { id: 'score', label: '点数とコンボ' },
  { id: 'beer', label: 'ビールとフィーバー' },
  { id: 'time', label: 'つきだし・しめタイム' },
  { id: 'gero', label: 'げろげろゲージ' },
  { id: 'diff', label: '難易度' },
  { id: 'item', label: '宝箱とアイテム' },
  { id: 'bug', label: '虫（ねずみ）と毒' },
  { id: 'rank', label: 'ランク' },
  { id: 'title', label: '称号' },
  { id: 'menu', label: 'ランキング・アカウント' },
]

const TITLE_COUNT = TITLES.length
const pct = (v) => `${Math.round(v * 1000) / 10}%`
const itemTotal = ITEMS.reduce((s, it) => s + it.weight, 0)
const f = (n) => (Number.isInteger(n) ? String(n) : (Math.round(n * 10) / 10).toString())
const ITEM_EFFECT = {
  お冷: `げろげろゲージ −${WATER_GERO}%`,
  日本酒: `げろげろゲージ +${SAKE_GERO}%、すぐフィーバー`,
  ストップウォッチ: `制限時間 +${EXTEND_SEC}秒`,
  ハリセン: '虫（ねずみ）を1匹叩く',
  呼び鈴: `毒を最大${BELL_CURE}個もとに戻す`,
}

// 手順を矢印でつないだ図
const Flow = ({ steps }) => (
  <div className="manual-flow">
    {steps.map((s, i) => (
      <span key={i} className="manual-flow-item">
        {i > 0 && <span className="arrow">▶</span>}
        <span className="step">{s}</span>
      </span>
    ))}
  </div>
)
const Img = ({ src }) => <img src={src} alt="" className="manual-icon" />

export default function ManualOverlay({ onClose }) {
  const bodyRef = useRef(null)
  const tocRef = useRef(null)
  const [atTop, setAtTop] = useState(true)

  // 目次が見えなくなったら「▲ 目次へ」を出す
  useEffect(() => {
    const ob = new IntersectionObserver(([e]) => setAtTop(e.isIntersecting), { root: bodyRef.current, threshold: 0.01 })
    if (tocRef.current) ob.observe(tocRef.current)
    return () => ob.disconnect()
  }, [])

  const jump = (e, id) => {
    e.preventDefault()
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="menu-back center" onClick={onClose}>
      <div className="manual-box" onClick={(e) => e.stopPropagation()}>
        <div className="manual-header">
          <span className="manual-title">
            <img src="/images/icon/information/マニュアル.png" alt="" className="manual-title-icon" /> マニュアル
          </span>
          {!atTop && <a href="#manual-toc" className="manual-toc-link" onClick={(e) => jump(e, 'manual-toc')}>▲ 目次へ</a>}
          <button className="manual-close" onClick={onClose} aria-label="閉じる">✕</button>
        </div>

        <div className="manual-body" ref={bodyRef}>
          <nav className="manual-toc" id="manual-toc" ref={tocRef}>
            <div className="manual-toc-title">もくじ</div>
            <ul className="manual-toc-list">
              {TOC.map((t, i) => (
                <li key={t.id}>
                  <a href={`#manual-${t.id}`} onClick={(e) => jump(e, `manual-${t.id}`)}>
                    <span className="manual-toc-num">{String(i + 1).padStart(2, '0')}</span>
                    <span>{t.label}</span>
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <section className="manual-section" id="manual-basic">
            <h3>01 基本ルール</h3>
            <Flow steps={['ピースをなぞって入れ替え', '指を離す', '同じ料理が3つ以上つながると消える', '上から新しいピース']} />
            <ul>
              <li>6×6の盤面。制限時間は <b>{GAME_SEC}秒</b>。</li>
              <li>1回のなぞりには<b>時間の上限</b>があります（盤面の下のバー。<a href="#manual-diff" onClick={(e) => jump(e, 'manual-diff')}>07 難易度</a>）。</li>
              <li>コンボが出ない入れ替えは、<b>制限時間が2秒減ります</b>。</li>
              <li>時間が0になっても、フィーバー中や操作中は、終わるまで続きます。</li>
              <li>消せる手がなくなると、盤面が<b>総入れ替え</b>になります（毒も消えます）。</li>
              <li>右上の「中断」で一時停止できます。</li>
            </ul>
          </section>

          <section className="manual-section" id="manual-screen">
            <h3>02 ゲーム画面の見かた</h3>
            <table className="manual-table">
              <tbody>
                <tr><th>タイマー</th><td>残り時間（上に難易度）</td></tr>
                <tr><th><Img src="/images/ポイント.png" /> SCORE</th><td>点数。増えると緑、減ると赤で表示</td></tr>
                <tr><th><Img src="/images/gero/げろげろ1.png" /> げろげろ</th><td>緑のゲージ。右の数字は<b>フィーバー回数</b></td></tr>
                <tr><th><Img src="/images/ビール.png" /> ジョッキ</th><td>満タンでフィーバー</td></tr>
                <tr><th>アイテム</th><td>5種類。右下の数字は所持数</td></tr>
                <tr><th>ランクボーナス</th><td>盤面の下。ランク1以上のときに表示</td></tr>
              </tbody>
            </table>
          </section>

          <section className="manual-section" id="manual-score">
            <h3>03 点数とコンボ</h3>
            <p className="manual-formula">
              1つの塊の点数<br />
              ＝ <b>基本点</b> × <b>個数ボーナス</b> × <b>コンボ倍率</b> × <b>種類倍率</b> × <b>フィーバー倍率</b>
            </p>
            <table className="manual-table">
              <tbody>
                <tr><th>基本点</th><td>消した数 ×（10 ＋ ランク）</td></tr>
                <tr><th>個数ボーナス</th><td>1 ＋ 0.5 ×（消した数 − 3）</td></tr>
                <tr><th>コンボ倍率</th><td>1 ＋ 0.25 ×（コンボ数 − 1）</td></tr>
                <tr><th>種類倍率</th><td>つきだし／しめタイム中は<a href="#manual-time" onClick={(e) => jump(e, 'manual-time')}>05</a>、それ以外は ×1</td></tr>
                <tr><th>フィーバー倍率</th><td>フィーバー中 ×2</td></tr>
              </tbody>
            </table>
            <table className="manual-table wide">
              <thead>
                <tr><th>1コンボ目（ランク0）</th><th>3個</th><th>4個</th><th>5個</th><th>6個</th></tr>
              </thead>
              <tbody>
                <tr><th>点数</th><td>30</td><td>60</td><td>100</td><td>150</td></tr>
              </tbody>
            </table>
            <p className="manual-tip">2コンボ目から倍率が上がります（2コンボ目 ×1.25、3コンボ目 ×1.5…）。宝箱を開けるのも1コンボです。</p>
          </section>

          <section className="manual-section" id="manual-beer">
            <h3>04 ビールとフィーバー</h3>
            <Flow steps={['コンボ数ぶん、ビールが注がれる', `${BEER_FULL}で満タン`, `フィーバー ${FEVER_SEC}秒`, 'ポイント ×2']} />
            <ul>
              <li>フィーバー中は、ビールが減っていきます（注がれません）。</li>
              <li>時間が来ても、<b>操作中とそのコンボが終わるまでは</b>続きます。</li>
              <li>宝箱と鍵が、{SPECIAL_FEVER_MULT}倍出やすくなります。</li>
              <li>げろげろゲージが増えます（<a href="#manual-gero" onClick={(e) => jump(e, 'manual-gero')}>06</a>）。</li>
            </ul>
          </section>

          <section className="manual-section" id="manual-time">
            <h3>05 つきだし・しめタイム</h3>
            <table className="manual-table wide">
              <thead>
                <tr><th /><th>いつ</th><th>対象</th><th>倍率</th><th>ゲージ</th></tr>
              </thead>
              <tbody>
                <tr><th>つきだし</th><td>開始から{TSUKIDASHI_SEC}秒</td><td>枝豆・冷やっこなど</td><td>×1.5</td><td>緑</td></tr>
                <tr><th>しめ</th><td>残り{SHIME_SEC}秒</td><td>お茶漬け・焼きおにぎり</td><td>×2</td><td>赤</td></tr>
              </tbody>
            </table>
            <p className="manual-tip">対象のピースは光って見えます。</p>
          </section>

          <section className="manual-section" id="manual-gero">
            <h3>06 げろげろゲージ</h3>
            <Flow steps={['ゲージが増える', '100%で吐く', `スコア −${GERO_PENALTY * 100}%`, '難易度ごとの値まで戻る']} />
            <table className="manual-table">
              <thead>
                <tr><th>増える</th><th>減る</th></tr>
              </thead>
              <tbody>
                <tr>
                  <td>フィーバー開始（難易度ごと）<br />日本酒 +{SAKE_GERO}%<br />毒ピースを消す +{POISON_GERO}%／個</td>
                  <td>お冷 −{WATER_GERO}%</td>
                </tr>
              </tbody>
            </table>
          </section>

          <section className="manual-section" id="manual-diff">
            <h3>07 難易度</h3>
            <table className="manual-table wide">
              <thead>
                <tr><th /><th>しらふ</th><th>ほろ酔い</th><th>泥酔</th></tr>
              </thead>
              <tbody>
                <tr><th>最終ポイント</th><td>×{DIFFICULTY.easy.mult}</td><td>×{DIFFICULTY.normal.mult}</td><td>×{DIFFICULTY.hard.mult}</td></tr>
                <tr><th>1回のなぞり</th><td>{DIFFICULTY.easy.dragSec}秒</td><td>{DIFFICULTY.normal.dragSec}秒</td><td>{DIFFICULTY.hard.dragSec}秒</td></tr>
                <tr><th>げろげろ増加</th><td>{f(DIFFICULTY.easy.geroAdd)}%</td><td>{f(DIFFICULTY.normal.geroAdd)}%</td><td>{f(DIFFICULTY.hard.geroAdd)}%</td></tr>
                <tr><th>100%後の戻り</th><td>{DIFFICULTY.easy.geroReset}%</td><td>{DIFFICULTY.normal.geroReset}%</td><td>{DIFFICULTY.hard.geroReset}%</td></tr>
                <tr><th>虫・ねずみ</th><td>出ない</td><td>最大{DIFFICULTY.normal.bugMax}匹</td><td>最大{Math.min(BUG_MAX.total, DIFFICULTY.hard.bugMax)}匹</td></tr>
                <tr><th>出ない料理</th><td>{DIFFICULTY.easy.exclude.length}種</td><td>{DIFFICULTY.normal.exclude.length}種</td><td>なし</td></tr>
              </tbody>
            </table>
          </section>

          <section className="manual-section" id="manual-item">
            <h3>08 宝箱とアイテム</h3>
            <div className="manual-flow">
              <span className="manual-flow-item"><span className="step"><Img src="/images/宝箱1-1.png" /> 宝箱</span></span>
              <span className="manual-flow-item"><span className="arrow">＋</span><span className="step"><Img src="/images/鍵1.png" /> 鍵</span></span>
              <span className="manual-flow-item"><span className="arrow">▶</span><span className="step">上下左右に隣りあわせる</span></span>
              <span className="manual-flow-item"><span className="arrow">▶</span><span className="step">アイテムを1つ獲得</span></span>
            </div>
            <ul>
              <li>消えたあとの補充で、まれに宝箱・鍵が出ます（<b>並べても消えません</b>）。</li>
              <li>宝箱を開けている間は、タイマーが止まります。</li>
              <li>アイテムは<b>2回タップで発動</b>（1回目で選択、3秒以内にもう一度）。</li>
            </ul>
            <table className="manual-table">
              <thead>
                <tr><th>アイテム</th><th>効果</th><th>出る確率</th></tr>
              </thead>
              <tbody>
                {ITEMS.map((it) => (
                  <tr key={it.img}>
                    <th><Img src={`/images/${it.img}.png`} /> {it.label}</th>
                    <td>{ITEM_EFFECT[it.img]}</td>
                    <td>{pct(it.weight / itemTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="manual-tip">使えない状況では、アイコンが<b>薄く</b>なります（お冷＝げろげろ0%、日本酒＝フィーバー中、ハリセン＝虫・ねずみがいない、呼び鈴＝毒がない）。</p>
          </section>

          <section className="manual-section" id="manual-bug">
            <h3>09 虫（ねずみ）と毒</h3>
            <div className="manual-flow">
              <span className="manual-flow-item"><span className="step"><Img src="/images/bug/ゴキブリ下.png" /><Img src="/images/bug/ハエ下.png" /> 開始{BUG_FREE_MS / 1000}秒後から出現</span></span>
              <span className="manual-flow-item"><span className="arrow">▶</span><span className="step">1マスに{BUG_STAY_MS / 1000}秒居座る</span></span>
              <span className="manual-flow-item"><span className="arrow">▶</span><span className="step"><Img src="/images/どくろ.png" /> そのピースが毒に</span></span>
            </div>
            <ul>
              <li>毒ピースを消すと、<b>1個ごとに −{POISON_TIME_SEC}秒、げろげろ +{POISON_GERO}%</b>。</li>
              <li>毒は、<b>消す</b>か<b>呼び鈴</b>でしか治りません。</li>
              <li>虫は、<b>ハリセン</b>で叩けます。</li>
              <li>しらふでは出ません。出る数は<a href="#manual-diff" onClick={(e) => jump(e, 'manual-diff')}>07 難易度</a>。</li>
            </ul>
            <p className="manual-tip">
              虫が苦手な人は、<b>ねずみ</b>（<Img src="/images/bug/ねずみ下右.png" />）に変えられます（動きと効果は同じ）。<br />
              ログイン → 「アカウント関連」→ アカウント編集 →「お邪魔キャラの変更」。HOMEのリンクからも開けます。
            </p>
          </section>

          <section className="manual-section" id="manual-rank">
            <h3>10 ランク</h3>
            <ul>
              <li>ログインして遊ぶと上がります（0〜{RANK_MAX}）。</li>
              <li>スコア <b>{RANK_MIN_PT}pt以上</b>のゲームで獲得したビールが、累計に入ります。</li>
              <li><b>{RANK_MIN_PT}pt未満のゲームは、何も記録されません</b>（ランキング・累計・称号）。</li>
              <li>ランク0→1は<b>ビール5杯</b>。上がるごとに、次に必要な数が<b>1杯ずつ</b>増えます。</li>
              <li>現在のランクと次のランクまでは、HOMEで見られます。</li>
            </ul>
            <table className="manual-table wide">
              <thead>
                <tr><th>ランク</th><th>累計ビール</th><th>基本点</th><th>フィーバー</th></tr>
              </thead>
              <tbody>
                {[1, 10, 20, 50, RANK_MAX].map((r) => (
                  <tr key={r}>
                    <th>{r}</th>
                    <td>{beersForRank(r).toLocaleString()}杯</td>
                    <td>+{r}</td>
                    <td>{feverBonusSec(r) > 0 ? `+${feverBonusSec(r)}秒` : 'なし'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="manual-tip">ランクボーナスは、<b>基本点に「ランク」を足す</b>／<b>ランク10ごとにフィーバーが0.5秒のびる</b>です。</p>
          </section>

          <section className="manual-section" id="manual-title">
            <h3>11 称号</h3>
            <ul>
              <li>ログインして、スコア <b>{TITLE_MIN_PT.toLocaleString()}pt以上</b>のゲームを終えるごとに、新しい称号を<b>1つ</b>獲得（全{TITLE_COUNT}種類）。</li>
              <li>変更は、「アカウント関連」→ アカウント編集 →「称号変更」。選ぶとすぐに変わります。</li>
              <li>HOMEの<b>「称号未設定」</b>からも開けます。</li>
              <li>設定した称号は、ランキングの名前の上に出ます。</li>
            </ul>
          </section>

          <section className="manual-section" id="manual-menu">
            <h3>12 ランキング・アカウント</h3>
            <table className="manual-table">
              <tbody>
                <tr><th>ランキング</th><td>本日・総合 × 難易度。ログイン中は自分の行が赤く点滅し、101位以下でも「あなたの順位」が出ます</td></tr>
                <tr><th>My統計</th><td>ベスト5、累積のビール数・げろげろ回数</td></tr>
                <tr><th>アカウント関連</th><td>ログイン・作成・編集（ニックネーム・称号・お邪魔キャラ・パスワード）・削除</td></tr>
                <tr><th>ゲーム設定</th><td>音量、省電力モード（バッテリーの減りが気になるとき）</td></tr>
              </tbody>
            </table>
            <ul>
              <li>順位は、<b>最終ポイント</b>（スコア ×難易度の倍率）で決まります。同じなら、ビールが多い順、げろげろが少ない順。</li>
              <li>順位表の更新は、最大で1〜2分ほど遅れることがあります。</li>
            </ul>
            <p className="manual-tip">アカウントは、ID・パスワード・「忘れたときの質問」で作ります（メールアドレスは不要）。<b>IDとパスワード、質問の答えをすべて忘れると、復旧できません。</b></p>
          </section>
        </div>
      </div>
    </div>
  )
}
