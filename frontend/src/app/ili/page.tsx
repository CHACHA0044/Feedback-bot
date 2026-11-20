"use client";

import Link from "next/link";
import styles from "./IliLanding.module.css";
import { useEffect, useState } from "react";
import ElectricBorder from "@/components/ElectricBorder";

interface Feature {
  title: string;
  icon: string;
  description: string;
}

const iliFeatures: Feature[] = [
  {
    title: "Google OAuth SSO Uplink",
    icon: "🔐",
    description: "One-click connection targeting ilizone.in with automated Google Account identity selector handshake."
  },
  {
    title: "Moodle Course Discovery",
    icon: "📚",
    description: "Automatic parsing of all enrolled subjects directly from my/courses.php including codes, IDs, and progress."
  },
  {
    title: "On-Demand Course Deep-Dive",
    icon: "🎯",
    description: "Target any individual course on demand to inspect activities, questionnaires, and assignment criteria."
  },
  {
    title: "Sesskey & CSRF Engine",
    icon: "🛡️",
    description: "Automatic extraction of Moodle session authentication tokens (sesskey) ensuring secure submission integrity."
  },
  {
    title: "Live Interactive Mirror",
    icon: "🖥️",
    description: "High-definition interactive viewport allowing direct interaction with Google 2FA or Moodle forms in real-time."
  },
  {
    title: "Deep JavaScript Inspection",
    icon: "🔬",
    description: "Extracts loaded YUI, AMD, form inputs, and endpoint handlers to reverse-engineer LMS feedback schemas."
  }
];

export default function IliLandingPage() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    localStorage.setItem("feedback_bot_platform", "ili");
    window.dispatchEvent(new CustomEvent("platform-change", { detail: "ili" }));
  }, []);

  if (!mounted) return null;

  return (
    <div className={styles.container}>
      <section className={styles.hero}>
        <div className={styles.botBadge}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#c042b4", boxShadow: "0 0 10px #c042b4" }} />
          <span>ILI LMS STATUS</span>
          <span style={{ color: "#c042b4" }}> : </span>
          <span>ONLINE<span className={styles.dot}>.</span><span className={styles.dot}>.</span><span className={styles.dot}>.</span></span>
        </div>

        <h1 className={styles.title}>
          <span className={styles.titlePart1}>Automate Your</span> <br />
          <span className={styles.titlePart2}>ILI Zone Feedback</span>
        </h1>

        <p className={styles.subtitle}>
          The specialized automation pipeline for Integral University&apos;s Moodle LMS (<code>ilizone.in</code>).
          Seamless Google OAuth identity uplink, dynamic course discovery, and deep activity inspection.
        </p>

        <div className={styles.ctaWrapper}>
          <Link href="/ili/op" className={styles.btnPrimaryIli}>
            <span>🚀 Open ILI Console</span>
          </Link>
          <a href="#features" className={styles.secondaryLink}>
            Explore Capabilities ↓
          </a>
        </div>
      </section>

      <section id="features" className={styles.featuresGrid}>
        {iliFeatures.map((feat, idx) => (
          <div key={idx} className={styles.featureCardWrapper}>
            <ElectricBorder
              color="#c042b4"
              speed={1.5}
              chaos={0.12}
              thickness={1.5}
              borderRadius={16}
              className={styles.featureCardWrapper}
            >
              <div className={styles.featureCard}>
                <div className={styles.featureHeader}>
                  <div className={styles.featureIcon}>{feat.icon}</div>
                  <div className={styles.featureTitle}>{feat.title}</div>
                </div>
                <p className={styles.featureDesc}>{feat.description}</p>
              </div>
            </ElectricBorder>
          </div>
        ))}
      </section>
    </div>
  );
}
