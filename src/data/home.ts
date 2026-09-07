export const homeProfile = {
  name: "DecSeven",
  avatar: "/profile.svg",
  avatarAlt: "DecSeven 标志头像",
  role: "开发者 · 记录者",
  headline: ["把想法写成代码，", "把经历写成文字。"],
  bio: "做能用的东西，写真实的过程。这里有技术实践，也有生活观察，和一些还没想明白的事。",
  github: "https://github.com/dec-seven",
  stack: [
    { label: "Frontend", value: "Vue / TypeScript / Astro" },
    { label: "Infra", value: "Linux / Docker / Cloudflare" },
    { label: "Mode", value: "Build · Write · Repeat" }
  ]
};

export const currentNote = {
  date: new Date("2026-09-06T00:00:00+08:00"),
  title: "给个人网站一个新的开始",
  description: "整理做过的项目，为技术、生活和奇想留出各自的位置。",
  href: "/work/personal-site/"
};

// 首页照片只从这里读取；保持 3-10 张，组件会按顺序轮播并最多展示 10 张。
export const photoNotes = [
  {
    src: "/images/profile-night.jpg",
    alt: "夜晚灯光下的古建筑与彩色无人机灯光秀",
    label: "NIGHT WALK / 01",
    title: "抬头看见夜里的颜色",
    caption: "有些夜晚，不需要解释，只需要记住当时抬头看见的颜色。"
  },
  {
    src: "/images/366ddd413fd67c2e9f1aba02853a13f5.jpg",
    alt: "夕阳照在海面上，远处是被金色雾气笼罩的城市轮廓，海边有人走过",
    label: "GOLDEN HOUR / 02",
    title: "日落之后，海岸暂时安静",
    caption: "太阳落下来，城市和海都暂时安静了一点。"
  },
  {
    src: "/images/ede5fffcb6d3914209c09f3937530d67.jpg",
    alt: "傍晚的水乡河道，一位船夫坐在小船上，岸边屋舍亮着暖色灯光",
    label: "WATER TOWN / 03",
    title: "沿着水走，时间慢下来",
    caption: "沿着水走，时间会换一种更慢的速度。"
  }
];

// 这些是首页的视觉入口，链接到可继续阅读的文章或案例，而不是独立内容源。
export const visualNotes = [
  {
    src: "/images/linux-proxy-architecture.svg",
    alt: "Linux 服务器代理链路：命令行工具通过本机端口进入 mihomo，再访问外部网络。",
    label: "ARCHITECTURE / 01",
    title: "先画清楚链路，再开始排错。",
    href: "/work/private-deployment/"
  },
  {
    src: "/images/linux-proxy-workflow.svg",
    alt: "mihomo 配置流程：安装、准备配置、前台测试、systemd 常驻和按需使用。",
    label: "WORKFLOW / 02",
    title: "把一次部署写成可以复用的顺序。",
    href: "/posts/linux-server-proxy-mihomo/"
  },
  {
    src: "/images/home-broadband/mostlogin-free-proxy.png",
    alt: "家宽代理流量领取页面截图。",
    label: "FIELD NOTE / 03",
    title: "真实操作留下的界面证据。",
    href: "/docs/家宽羊毛文档/"
  }
];
