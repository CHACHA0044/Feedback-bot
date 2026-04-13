"use client";

import Link from "next/link";
import styles from "./LandingPage.module.css";
import { useEffect, useState } from "react";

export default function LandingPage() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <div className={styles.container}>
      <section className={`${styles.hero} animate-fade-in`}>
        <div className={styles.botBadge}>
          <span className="animate-pulse">●</span> BOT STATUS: ONLINE
        </div>
        <h1 className={styles.title}>
          Automate Your <br />
          <span className="text-glow">IUSMS Feedback</span>
        </h1>
        <p className={styles.subtitle}>
          The futuristic automation engine that skips the boredom. 
          Fill your forms in under 5 minutes with precision and speed.
        </p>
        
        <div className={styles.ctaWrapper}>
          <Link href="/fill" className="btn-primary">
            Fill Feedback
          </Link>
          <a href="#demo" className={styles.secondaryLink}>
            Watch Demo
          </a>
        </div>
      </section>

      <section id="demo" className={styles.howItWorks}>
        <h2 className={styles.sectionTitle}>System Clearance</h2>
        <div className={styles.videoContainer}>
          {/* Note: Google Drive videos often need a special embed URL structure */}
          <iframe 
            src="https://drive.google.com/file/d/1n_JXNliyj0Nkn2cihvfX0Vd6b8CFk6yZ/preview" 
            allow="autoplay"
            title="Bot Demo Video"
          ></iframe>
        </div>
      </section>

      <section className={styles.featuresGrid}>
        <div className={`${styles.featureCard} glass`}>
          <div className={styles.featureIcon}>⚡</div>
          <h3 className={styles.featureTitle}>Hyper Fast</h3>
          <p className={styles.featureText}>Process multi-subject feedback in parallel timestamps. Minutes to seconds.</p>
        </div>
        <div className={`${styles.featureCard} glass`}>
          <div className={styles.featureIcon}>🛡️</div>
          <h3 className={styles.featureTitle}>Smart Skip</h3>
          <p className={styles.featureText}>Automatically detects and bypasses already submitted feedback forms.</p>
        </div>
        <div className={`${styles.featureCard} glass`}>
          <div className={styles.featureIcon}>🛠️</div>
          <h3 className={styles.featureTitle}>Dual Logic</h3>
          <p className={styles.featureText}>Handles both Theory and Lab sessions with separate teacher mappings.</p>
        </div>
      </section>

      <footer className={styles.footer}>
        <p>&copy; {new Date().getFullYear()} FEEDBACK-BOT.V2. MISSION READY.</p>
      </footer>
    </div>
  );
}
