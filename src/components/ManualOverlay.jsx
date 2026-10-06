import { useEffect, useRef, useState } from 'react'
import { TITLES } from '../titles'
import {
  BEER_FULL, BELL_CURE, BUG_FREE_MS, BUG_LOTTERY_MS, BUG_MAX, BUG_STAY_MS, DIFFICULTY, EXTEND_SEC, FEVER_SEC, GAME_SEC,
  GERO_PENALTY, ITEMS, POISON_GERO, POISON_TIME_SEC, SAKE_GERO, SHIME_SEC, SPECIAL_FEVER_MULT, SPECIAL_MAX_EACH, SPECIAL_RATES,
  TSUKIDASHI_SEC, WATER_GERO, CHEST, KEY,
  TITLE_MIN_PT,
} from '../constants'
import { RANK_MAX, RANK_MIN_PT } from '../rank'

const TOC = [
  { id: 'basic', label: '基本ルール' },
  { id: 'screen', label: 'ゲーム画面の見かた' },
  { id: 'score', label: '点数とコンボ' },
  { id: 'beer', label: 'ビールとフィーバー' },
  { id: 'time', label: 'つきだし・しめタイム' },
  { id: 'gero', label: 'げろげろゲージ' },
  { id: 'diff', label: '難易度' },
  { id: 'chest', label: '宝箱と鍵' },
  { id: 'item', label: 'アイテム' },
  { id: 'bug', label: '虫と毒' },
  { id: 'shuffle', label: '総入れ替え' },
  { id: 'result', label: '結果画面' },
  { id: 'title', label: '称号' },
  { id: 'rank', label: 'ランク' },
  { id: 'menu', label: 'メニュー' },
]

const TITLE_COUNT = TITLES.length
const pct = (v) => `${Math.round(v * 1000) / 10}%`
const itemTotal = ITEMS.reduce((s, it) => s + it.weight, 0)
const f = (n) => (Number.isInteger(n) ? String(n) : (Math.round(n * 10) / 10).toString())

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
            <ul>
              <li>6×6の盤面で、ピースを指でなぞって入れ替えます。指を離すと、3つ以上つながった同じ料理が消えます。</li>
              <li>制限時間は <b>{GAME_SEC}秒</b>。消えると上から新しいピースが落ちてきます。</li>
              <li>1回の操作は最大 {DIFFICULTY.easy.dragSec}秒（しらふ）／{DIFFICULTY.normal.dragSec}秒（ほろ酔い）／{DIFFICULTY.hard.dragSec}秒（泥酔）。盤面の上のバーが残り時間です。</li>
              <li>ピースを動かしてもコンボが1つも出ないと、<b>制限時間が2秒減ります</b>。</li>
              <li>時間が0になっても、フィーバー中・コンボの処理中・操作中・ビールを注いでいる間は、終わるまで待ちます。</li>
              <li>ゲーム中は右上の「中断」で一時停止できます（再開・HOMEに戻る）。</li>
            </ul>
          </section>

          <section className="manual-section" id="manual-screen">
            <h3>02 ゲーム画面の見かた</h3>
            <ul>
              <li><b>タイマー</b>：残り時間（秒とミリ秒）。上に難易度が出ます。</li>
              <li><b>ポイント</b>：点数。増えると緑、減ると赤で「+」「-」が出ます。</li>
              <li><b>げろげろゲージ</b>：緑のゲージ。右にビールの回数（フィーバー回数）が出ます。</li>
              <li><b>ビールのジョッキ</b>：盤面の右下。満タンでフィーバー。</li>
              <li><b>アイテム枠</b>：お冷・日本酒・延長・ハリセン・呼び鈴。右下の数字は所持数で、持っていないものは半透明です。</li>
            </ul>
          </section>

          <section className="manual-section" id="manual-score">
            <h3>03 点数とコンボ</h3>
            <p className="manual-formula">
              1つの塊の点数<br />
              ＝ <b>基本点</b> × <b>個数ボーナス</b> × <b>コンボ倍率</b><br />
              　× <b>種類倍率</b> × <b>フィーバー倍率</b>
            </p>
            <table className="manual-table">
              <tbody>
                <tr><th>基本点</th><td>消した数 ×（10 ＋ ランク）</td></tr>
                <tr><th>個数ボーナス</th><td>1 ＋ 0.5 ×（消した数 − 3）</td></tr>
                <tr><th>コンボ倍率</th><td>1 ＋ 0.25 ×（コンボ数 − 1）</td></tr>
                <tr><th>種類倍率</th><td>つきだし（最初の{TSUKIDASHI_SEC}秒）＝1.5<br />しめ（最後の{SHIME_SEC}秒）＝2<br />それ以外＝1</td></tr>
                <tr><th>フィーバー倍率</th><td>フィーバー中＝2、通常＝1</td></tr>
              </tbody>
            </table>
            <table className="manual-table wide">
              <thead>
                <tr><th>消した数</th><th>3個</th><th>4個</th><th>5個</th><th>6個</th></tr>
              </thead>
              <tbody>
                <tr><th>1コンボ目</th><td>30pt</td><td>60pt</td><td>100pt</td><td>150pt</td></tr>
              </tbody>
            </table>
            <ul>
              <li>2コンボ目からは、コンボ倍率が掛かります（2コンボ目は ×1.25、3コンボ目は ×1.5…）。</li>
              <li>同時に揃った塊は、下にあるものから（同じ高さなら左から）順に消え、1つずつ音階（ド・レ・ミ…）が鳴ります。</li>
              <li>宝箱を開けることも1コンボに数えます。</li>
            </ul>
          </section>

          <section className="manual-section" id="manual-beer">
            <h3>04 ビールとフィーバー</h3>
            <ul>
              <li>連鎖が終わると、そのコンボ数ぶんビールが注がれます。{BEER_FULL}で満タン。</li>
              <li>満タンで<b>フィーバー（{FEVER_SEC}秒）</b>。ポイントが2倍になり、ビールは{FEVER_SEC}秒かけて減っていきます（この間は注がれません）。時間が来ても、<b>操作中とそのコンボが終わるまでは、フィーバーは続きます</b>。</li>
              <li>ゲーム開始の乾杯で、ジョッキは満タンから始まります（フィーバーにはなりません）。ビールの回数は、乾杯の1杯めから数えます。</li>
              <li>フィーバー中は、宝箱と鍵の出現率が{SPECIAL_FEVER_MULT}倍になります。</li>
            </ul>
          </section>

          <section className="manual-section" id="manual-time">
            <h3>05 つきだしタイム・しめタイム</h3>
            <ul>
              <li><b>つきだしタイム</b>：開始から{TSUKIDASHI_SEC}秒間。つきだし（枝豆・冷やっこなど）のピースが <b>×1.5</b>。タイマーゲージが緑になります。</li>
              <li><b>しめタイム</b>：残り{SHIME_SEC}秒間。しめ（お茶漬け・焼きおにぎり）のピースが <b>×2</b>。タイマーゲージが赤になります。</li>
              <li>対象のピースは光って見えます。</li>
            </ul>
          </section>

          <section className="manual-section" id="manual-gero">
            <h3>06 げろげろゲージ</h3>
            <ul>
              <li>フィーバーが始まるたびに、難易度ごとの量だけ増えます（赤いゲージが伸びます）。</li>
              <li><b>100%</b>になると吐いてしまい、<b>スコアが{GERO_PENALTY * 100}%減ります</b>。ゲージは難易度ごとの値まで戻ります。</li>
              <li>ゲージの%に合わせて、げろげろの絵が変わります。</li>
            </ul>
            <table className="manual-table">
              <tbody>
                <tr><th>〜59%</th><td>1と2を交互に（ときどき3）</td></tr>
                <tr><th>60% / 75% / 90%</th><td>その%になると固定（90%は左右にゆれる）</td></tr>
                <tr><th>100%</th><td>100-1（小刻みにゆれる）→ 100-2</td></tr>
                <tr><th>アイテム・虫</th><td>獲得・使用・虫の出現時に、3秒だけ虫アイテムの絵</td></tr>
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
                <tr><th>げろげろ増加</th><td>{f(DIFFICULTY.easy.geroAdd)}%</td><td>{f(DIFFICULTY.normal.geroAdd)}%</td><td>{f(DIFFICULTY.hard.geroAdd)}%</td></tr>
                <tr><th>100%後の戻り</th><td>{DIFFICULTY.easy.geroReset}%</td><td>{DIFFICULTY.normal.geroReset}%</td><td>{DIFFICULTY.hard.geroReset}%</td></tr>
                <tr><th>最終ポイント</th><td>×{DIFFICULTY.easy.mult}</td><td>×{DIFFICULTY.normal.mult}</td><td>×{DIFFICULTY.hard.mult}</td></tr>
                <tr><th>1回の操作</th><td>{DIFFICULTY.easy.dragSec}秒</td><td>{DIFFICULTY.normal.dragSec}秒</td><td>{DIFFICULTY.hard.dragSec}秒</td></tr>
                <tr><th>虫</th><td>出ない</td><td>{pct(DIFFICULTY.normal.bugRate)}<br />最大{DIFFICULTY.normal.bugMax}匹</td><td>{pct(DIFFICULTY.hard.bugRate)}<br />最大{Math.min(BUG_MAX.total, DIFFICULTY.hard.bugMax)}匹</td></tr>
                <tr><th>出ない料理</th><td>{DIFFICULTY.easy.exclude.length}種</td><td>{DIFFICULTY.normal.exclude.length}種</td><td>なし</td></tr>
              </tbody>
            </table>
          </section>

          <section className="manual-section" id="manual-chest">
            <h3>08 宝箱と鍵</h3>
            <ul>
              <li>消えたあとに補充されるピースが、まれに<b>宝箱</b>や<b>鍵</b>になります（それぞれ約{pct(SPECIAL_RATES[CHEST])}／{pct(SPECIAL_RATES[KEY])}、フィーバー中は{SPECIAL_FEVER_MULT}倍）。盤面には、それぞれ最大{SPECIAL_MAX_EACH}個までです。</li>
              <li>宝箱と鍵は、並べても消えません。<b>宝箱と鍵を上下左右に隣りあわせる</b>と、宝箱が開きます。</li>
              <li>開くと、約2秒の演出のあと、アイテムを1つ獲得します。この間、タイマーも止まります。</li>
            </ul>
            <table className="manual-table">
              <tbody>
                {ITEMS.map((it) => (
                  <tr key={it.img}>
                    <th><img src={`/images/${it.img}.png`} alt="" className="manual-icon" /> {it.label}</th>
                    <td>{pct(it.weight / itemTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="manual-section" id="manual-item">
            <h3>09 アイテム</h3>
            <ul>
              <li><b>2回タップで発動</b>します。1回目で選択（枠が点滅）、3秒以内にもう一度タップで使用。</li>
              <li><b>お冷</b>：げろげろゲージを{WATER_GERO}%減らす。</li>
              <li><b>日本酒</b>：げろげろゲージを{SAKE_GERO}%増やし、強制的にフィーバーにする（ビールの回数も+1）。</li>
              <li><b>延長</b>：制限時間を{EXTEND_SEC}秒延ばす（{GAME_SEC}秒を超えてもOK）。</li>
              <li><b>ハリセン</b>：虫が赤く点滅するので、叩きたい虫のいるマスをタップ（虫がいないときは使えません）。</li>
              <li><b>呼び鈴</b>：毒のピースを、ランダムで最大{BELL_CURE}個もとに戻す（毒がないときは使えません）。</li>
            </ul>
          </section>

          <section className="manual-section" id="manual-bug">
            <h3>10 虫と毒</h3>
            <ul>
              <li>ゲーム開始から{BUG_FREE_MS / 1000}秒たつと、{BUG_LOTTERY_MS / 1000}秒おきの抽選で、<b>ゴキブリかハエ</b>が盤面の端から現れます（しらふでは出ません）。</li>
              <li>同時に出るのは、ゴキブリ最大{BUG_MAX.roach}匹、ハエ最大{BUG_MAX.fly}匹、合わせて最大{BUG_MAX.total}匹（ほろ酔いは最大{DIFFICULTY.normal.bugMax}匹）。</li>
              <li>虫は1マスに{BUG_STAY_MS / 1000}秒とどまり、反対側の端へ1マスずつ進みます。端まで行くと、別の端からまた現れます。</li>
              <li>{BUG_STAY_MS / 1000}秒居座られたマスのピースは<b>毒</b>になります（背景の右下が紫になり、どくろが付きます）。</li>
              <li>毒ピースを消すと、<b>1個ごとに制限時間が{POISON_TIME_SEC}秒減り、げろげろゲージが{POISON_GERO}%増えます</b>。</li>
              <li>毒は、消す／呼び鈴を使う以外では治りません。ピースを動かしても毒は付いたままです。</li>
              <li>虫が苦手な人は、ログインして「アカウント編集・削除」の<b>「お邪魔キャラの変更」</b>で、虫を<b>ねずみ</b>に変えられます（動きや効果は同じです）。HOMEのスタートボタンの下のリンクからも開けます。</li>
            </ul>
          </section>

          <section className="manual-section" id="manual-shuffle">
            <h3>11 総入れ替え</h3>
            <ul>
              <li>同じ料理が3つ以上そろう種類がなく、宝箱と鍵の組み合わせもない（消せる手がない）ときは、盤面のピースがすべて入れ替わります。毒の位置は引き継がれます。</li>
            </ul>
          </section>

          <section className="manual-section" id="manual-result">
            <h3>12 結果画面</h3>
            <ul>
              <li>ゲーム中のスコアに、難易度の倍率を掛けたものが<b>最終ポイント</b>です。</li>
              <li>ビールのマークの横は<b>フィーバー回数</b>、げろげろのマークの横は<b>げろげろ100%になった回数</b>です。</li>
              <li>「再プレイ」で同じ難易度のまま、もう一度遊べます。</li>
            </ul>
          </section>

          <section className="manual-section" id="manual-title">
            <h3>13 称号</h3>
            <ul>
              <li>ログインして遊ぶと、<b>スコア{TITLE_MIN_PT.toLocaleString()}pt以上で1ゲーム終えるごとに、新しい称号を1つ獲得</b>します（まだ持っていない称号から、ランダムに選ばれます）。結果画面に、獲得した称号が出ます。</li>
              <li>称号は全部で{TITLE_COUNT}種類です。すべて獲得すると、それ以上は増えません。</li>
              <li>メニューの「アカウント編集・削除」の<b>「称号変更」</b>で、好きな称号を選べます。選ぶとすぐに変更されます。獲得した称号が上に、まだの称号は薄く下に、それぞれ五十音順に並びます。初期は「なし」で、称号を表示しません。</li>
              <li>設定した称号は、<b>ランキングの名前の上</b>に、小さく表示されます。</li>
              <li>ログインしていないと、称号は獲得できません。</li>
            </ul>
          </section>

          <section className="manual-section" id="manual-rank">
            <h3>14 ランク</h3>
            <ul>
              <li>ログインして遊ぶと、<b>ランク</b>が上がります（ランク0から、最大{RANK_MAX}まで）。ログインしていないとランク0です。</li>
              <li>スコア<b>{RANK_MIN_PT}pt以上</b>で終えたゲームのビールが、累計に数えられます。{RANK_MIN_PT}pt未満のゲームは、ランキングの記録・累計・称号など、何も更新されません。</li>
              <li>ランク0から1へは<b>ビール5杯</b>。ランクが上がるごとに、次に必要なビールが<b>1杯ずつ</b>増えます（1→2は6杯、2→3は7杯…）。</li>
              <li>ランクの分だけ、<b>基本点が増えます</b>（消した数 ×（10 ＋ ランク））。</li>
              <li><b>ランク10ごとに、フィーバーが0.5秒のびます</b>（ランク10で+0.5秒、ランク20で+1秒…）。</li>
              <li>いまのランクと、次のランクまでのビールは、メニューの「アカウント」で見られます。</li>
            </ul>
          </section>

          <section className="manual-section" id="manual-menu">
            <h3>15 メニュー</h3>
            <ul>
              <li>右上の三本線から、マニュアル・ランキング・アカウント・ゲーム設定を開けます（ゲーム中は「中断」ボタンに切り替わります）。</li>
              <li><b>ランキング</b>：本日・総合 × しらふ・ほろ酔い・泥酔・すべて。名前はニックネームで表示され、ビール数・げろげろ数も並びます。ログイン中は自分の行が赤く光り、101位以下でも「あなたの順位」が出ます。</li>
              <li><b>アカウント</b>：ID・パスワード・ニックネーム・「忘れたときの質問」で作ります（メールアドレスは使いません）。パスワードを忘れたら、IDと質問の答えで再設定できます。ログインすると、ベスト5と累積のビール数・げろげろ回数が記録されます。</li>
              <li>ゲーム設定は、準備中です。</li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  )
}
