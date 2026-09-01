import type { Metadata } from "next";
import userFlowAsset from "../../docs/assets/huiye-user-path-bpmn.svg";
import styles from "./portfolio.module.css";

const githubUrl = "https://github.com/Chenzhengheng/czh--huiye";
const userFlowUrl = userFlowAsset.src;

export const metadata: Metadata = {
  title: "回页｜让思考继续生长",
  description:
    "回页是一款由用户划定思考边界、由 AI 基于原文显化思考变化的 AI 原生记录产品。",
};

const productPrinciples = [
  ["01", "选择性归线", "用户决定哪些记录在讨论同一件事，AI 不替人整理完整人生。"],
  ["02", "线内观察", "AI 优先在一条主思考线中寻找最小充分证据，没有真实关系就保持沉默。"],
  ["03", "暂时看见", "观察可以被修正，也可以不回应；是否有价值始终由用户判断。"],
];

const productThoughtLine = [
  {
    date: "7 月 16 日",
    excerpt: "我真正缺少的是：让一段思考拥有后续生命的机制。",
    selected: false,
  },
  {
    date: "7 月 20 日",
    excerpt:
      "AI 帮忙整理，只是给原本内容一个可辨认的入口，让我知道当时我想的是什么，思考的主导权还是在人身上。",
    selected: true,
  },
  {
    date: "8 月 8 日",
    excerpt:
      "解决方案是一个叫思考线的功能……当 AI 寻找联系时，优先从每一条人工建立联系的思考线出发。",
    selected: true,
  },
];

export default function PortfolioPage() {
  return (
    <main className={styles.page}>
      <nav className={styles.nav} aria-label="作品集导航">
        <a className={styles.brand} href="#top" aria-label="回到页首">
          <span>回</span>
          <b>回页</b>
          <em>让思考继续生长</em>
        </a>
        <div className={styles.navLinks}>
          <a href="#product">核心体验</a>
          <a href="#flow">用户流程图</a>
          <a href="#evaluation">回响评测</a>
          <a href="#delivery">工程交付</a>
          <a href={githubUrl} target="_blank" rel="noreferrer">GitHub ↗</a>
        </div>
      </nav>

      <section className={styles.hero} id="top">
        <p className={styles.ownerCredit}>负责人：陈政亨</p>
        <div className={styles.heroVisual} aria-label="两篇笔记被一条思考线重新连接">
          <article className={styles.visualNote}>
            <small>过去的一页</small>
            <i /><i /><i /><i />
            <span>✦ 思考线</span>
          </article>
          <div className={styles.connector} aria-hidden="true"><b /></div>
          <article className={`${styles.visualNote} ${styles.visualNoteB}`}>
            <small>现在的一页</small>
            <i /><i /><i /><i />
            <span>一处变化</span>
          </article>
          <p>记录散落在不同时间，思考仍可能在其中延续。</p>
        </div>

        <div className={styles.heroContent}>
          <p className={styles.eyebrow}>回页 · 0 → 1</p>
          <h1>回页是一款能随时随地、无负担地记录思考，并让思考彼此连接的 AI 原生记录产品。</h1>
          <p className={styles.lead}>
            我从 0 到 1 独立负责回页的产品定位、交互设计、Agent Prompt、评测体系与工程交付（Codex）。
          </p>
          <div className={styles.actions}>
            <a className={styles.primaryAction} href="/portfolio/demo">体验回页 <span>→</span></a>
            <a className={styles.textAction} href="/portfolio/demo/evaluation">查看完整评测</a>
          </div>
          <dl className={styles.stats} aria-label="项目摘要">
            <div><dt>10</dt><dd>真实评测 Case</dd></div>
            <div><dt>3</dt><dd>Prompt 版本</dd></div>
            <div><dt>5</dt><dd>类思考关系</dd></div>
          </dl>
          <aside className={styles.heroThesis}>
            <strong>过去的记录没有消失，只是很少再被真正看见。</strong>
            <p>回页让人先划定思考边界，再让 AI 基于原文把已经发生的变化说清一点。</p>
          </aside>
        </div>
      </section>

      <section className={styles.product} id="product">
        <header className={`${styles.sectionHeader} ${styles.productHeader}`}>
          <div>
            <p className={styles.sectionIndex}>01 · 核心体验</p>
            <h2>人先归线，AI 再观察。</h2>
          </div>
          <div className={styles.coreEssay}>
            <p>
              人会不断记录，也会在生活、阅读、交流和新经历中改变。关于同一件事的思考常散落在许多日记里，变化已经发生，却未必能及时看清。
            </p>
            <p>
              回页让用户用特殊标签建立思考线，AI 只在线内观察，把原文中的延续、修正、分支、冲突或未解决问题显化出来。
            </p>
            <p>
              AI 不建立人生图谱，也不替用户下结论。它只提出一次可以被修正的暂时看见。用户可以回味、回应、继续写，也可以沉默离开。
            </p>
          </div>
        </header>

        <ol className={styles.principles}>
          {productPrinciples.map(([number, title, body]) => (
            <li key={number}>
              <span>{number}</span>
              <strong>{title}</strong>
              <p>{body}</p>
            </li>
          ))}
        </ol>

        <section className={styles.thoughtLineStory} aria-label="回页真实产品思考线">
          <header>
            <div>
              <span>✦ 回页</span>
              <strong>一条真实产品思考线</strong>
            </div>
            <p>用户先把同一件事归在一起，AI 再从中选择足以说明变化的原文。</p>
          </header>
          <ol>
            {productThoughtLine.map((entry, index) => (
              <li key={entry.date} className={entry.selected ? styles.selectedThought : undefined}>
                <span className={styles.thoughtDot} aria-hidden="true" />
                <article>
                  <div>
                    <time>{entry.date}</time>
                    {entry.selected ? <b>本次观察来源</b> : null}
                  </div>
                  <blockquote>“{entry.excerpt}”</blockquote>
                  <footer>
                    <span>✦ 回页</span>
                    <small>日记 {String(index + 1).padStart(2, "0")}</small>
                  </footer>
                </article>
              </li>
            ))}
          </ol>
          <div className={styles.thoughtLineHandoff}>
            <span>AI 选择后两篇作为最小充分证据</span>
            <i aria-hidden="true">↓</i>
            <a href="/portfolio/demo">在回页演示中展开完整原文 →</a>
          </div>
        </section>

        <article className={styles.realCase}>
          <header className={styles.caseHeader}>
            <div>
              <p className={styles.caseLabel}>AI 暂时看见 · 由你判断</p>
              <h3>AI 发现：回页对 AI 职责的设想，从替每篇记录做轻量整理，逐渐收窄为只在用户划定的思考线内观察。</h3>
            </div>
            <span>来自思考线 · 回页</span>
          </header>

          <div className={styles.sourceGrid}>
            <section className={styles.sourceCard}>
              <div><b>日记 A</b><time>较早</time></div>
              <blockquote>
                “AI 帮忙整理，只是给原本内容一个可辨认的入口，让我知道当时我想的是什么，思考的主导权还是在人身上。”
              </blockquote>
              <span className={styles.sourceLineTag}>✦ 回页</span>
            </section>
            <div className={styles.caseBridge} aria-hidden="true"><i /><span>职责收窄</span><i /></div>
            <section className={styles.sourceCard}>
              <div><b>日记 B</b><time>后来</time></div>
              <blockquote>
                “我希望能记录下自己的思考，AI 做的是将思考中隐藏的变化显化，让我对自己更清晰。我要拿回思考的主导权。”
              </blockquote>
              <span className={styles.sourceLineTag}>✦ 回页</span>
            </section>
          </div>
          <p className={styles.privacyNote}>均来自真实脱敏笔记</p>

        </article>
      </section>

      <section className={styles.flow} id="flow">
        <div className={styles.flowIntro}>
          <p className={styles.sectionIndex}>02 · 用户流程图</p>
          <h2>从写下一页，到再次遇见。</h2>
          <p>流程覆盖写下、归线、AI 在线内观察、低打扰出现、回应与评测。点击图面可查看完整尺寸。</p>
        </div>
        <a className={styles.flowCanvas} href={userFlowUrl} target="_blank" rel="noreferrer">
          <img src={userFlowUrl} alt="回页完整用户流程图" />
          <span>打开完整流程图 ↗</span>
        </a>
      </section>

      <section className={styles.evaluation} id="evaluation">
        <header className={styles.sectionHeader}>
          <div>
            <p className={styles.sectionIndex}>03 · 回响评测</p>
            <h2>评测 AI 的观察，是否让变化更清楚。</h2>
          </div>
          <p>
            从关系成立度、显化增量和重逢感三个维度检查回响，并结合用户原话判断 good / bad、定位偏差和迭代 Prompt。
          </p>
        </header>

        <div className={styles.evalCases}>
          <article className={styles.evalCard}>
            <div className={styles.evalMeta}><span>CASE 01 · BAD</span><b>Prompt · manual calibration</b></div>
            <h3>关系可以成立，但没有带来新的看见</h3>
            <div className={styles.evalEvidence}>
              <p><b>日记 A</b>“第一份工作强调的是，成长，和优秀的人交流，去到一个你感兴趣的岗位。”</p>
              <p><b>日记 B</b>“下一份工作，入职前一定要确认清楚，如果我进来会做什么内容。”</p>
            </div>
            <blockquote>
              AI 看见：你从“进入工作后理解真相”，走向“进入之前问清关键条件”。
            </blockquote>
            <div className={styles.aiQuestion}>
              <span>AI 的最后问题</span>
              <p>“这更像是你变得更清楚自己需要什么，还是你开始担心再次进入一个缺少上下文的环境？”</p>
            </div>
            <div className={styles.userFeedback}>
              <span>用户真实反馈</span>
              <p>“AI 的判断令我一点惊喜都没有。这里的核心价值应该是‘我得到了反馈后对自己结论的修正’，而且很明显。最后的问题也让我无感。”</p>
            </div>
            <div className={styles.scoreRow}>
              <span>关系成立度 <b>中</b></span>
              <span>显化增量 <b>低</b></span>
              <span>重逢感 <b>低</b></span>
            </div>
          </article>

          <article className={`${styles.evalCard} ${styles.goodCase}`}>
            <div className={styles.evalMeta}><span>CASE 10 · GOOD</span><b>Prompt v0.3</b></div>
            <h3>同一本书，推动了产品原则与自我审视</h3>
            <div className={styles.evalEvidence}>
              <p><b>日记 A</b>“在我阅读了《复利效应》的一部分后……AI 做的是将其显化让我更清晰，我要拿回思考的主导权。”</p>
              <p><b>日记 B</b>“阅读《复利效应》后会发现……没想清楚的目标、含糊的动力源才是拖慢我成长的主要因素。”</p>
            </div>
            <blockquote>
              AI 看见：你为回页定下的边界，也许紧接着就被自己实践了一次——先把生活里的因果拎清楚、决定什么值得改变的人，仍然是你。
            </blockquote>
            <div className={styles.userFeedback}>
              <span>用户真实反馈</span>
              <p>“比较惊喜。我惊觉对我产品定位和AI思考都有突破的来源都是《复利效应》这一本书。good啊”</p>
            </div>
            <div className={styles.scoreRow}>
              <span>关系成立度 <b>高</b></span>
              <span>显化增量 <b>高</b></span>
              <span>重逢感 <b>高</b></span>
            </div>
          </article>
        </div>

        <div className={styles.iterationNote}>
          <div><span>01</span><p>先看原文关系是否真实成立</p></div>
          <i>→</i>
          <div><span>02</span><p>再看是否显化了尚未说清的变化</p></div>
          <i>→</i>
          <div><span>03</span><p>依据用户原话归因并迭代 Prompt</p></div>
          <a href="/portfolio/demo/evaluation">查看 10 个完整 Case →</a>
        </div>
      </section>

      <section className={styles.delivery} id="delivery">
        <header className={styles.sectionHeader}>
          <div>
            <p className={styles.sectionIndex}>04 · 工程交付</p>
            <h2>产品判断，最终落到可运行、可验证、可追踪。</h2>
          </div>
          <p>从产品定位到公开部署，所有核心决策、Prompt 版本、评测 Case 与实现均保留可追踪证据。</p>
        </header>
        <div className={styles.deliveryGrid}>
          <article><b>本地优先</b><p>私人原文保存在用户拥有的本地文件夹；公开模式永不读取私人 Entry。</p></article>
          <article><b>Agent Prompt</b><p>Prompt v0.1–v0.3 完整留档，每个 Case 记录生成版本与用户原话。</p></article>
          <article><b>评测闭环</b><p>10 个 Case、3 项维度、good / bad 判断与归因在同一工作台追踪。</p></article>
          <article><b>工程实现</b><p>TypeScript、React、Cloudflare 与自动化测试共同保证公开交付。</p></article>
        </div>
        <a className={styles.repoBanner} href={githubUrl} target="_blank" rel="noreferrer">
          <span>完整代码、产品文档、数据结构与流程图</span>
          <strong>打开 GitHub 仓库 ↗</strong>
        </a>
      </section>

      <footer className={styles.footer}>
        <div><span>回</span><b>回页 · 让思考继续生长</b></div>
        <p>所有公开内容均使用固定脱敏数据，不读取或保存访客的私人记录。</p>
        <a href={githubUrl} target="_blank" rel="noreferrer">GitHub ↗</a>
      </footer>
    </main>
  );
}
