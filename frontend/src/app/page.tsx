"use client";

import Link from "next/link";
import styles from "./LandingPage.module.css";
import { useEffect, useState, useRef } from "react";
import ElectricBorder from "@/components/ElectricBorder";

interface Feature {
  title: string;
  icon: string;
  description: string;
  detail: string;
}

const features: Feature[] = [
  {
    title: "Theory Automation",
    icon: "⚡",
    description: "Automatically fills theory subject forms with specific teacher mappings.",
    detail: "The bot parses your theory subjects and teachers from the configuration, navigates to the IUSMS theory feedback portal, and fills all 20+ questions per subject in seconds."
  },
  {
    title: "Lab Feedback",
    icon: "🔬",
    description: "Handles lab subject reports and evaluations with precision.",
    detail: "Supports dual-teacher mapping for labs. It ensures that both primary and secondary instructors receive the correct feedback criteria as per your sentiment bias."
  },
  {
    title: "Mentor Directive",
    icon: "🛡️",
    description: "Single-click automation for mentor sessions and reviews.",
    detail: "Navigates to the specialized Mentor Feedback section, identifying your specified department and mentor name to complete evaluations without manual clicking."
  },
  {
    title: "Smart Skip",
    icon: "⏭️",
    description: "Intelligently skips forms that have already been submitted.",
    detail: "Bot detects 'Already Submitted' alerts from the portal and skips the entry, preventing redundant work and keeping your logs clean."
  },
  {
    title: "Duplicate Detection",
    icon: "🔍",
    description: "Robust checking to prevent multiple submissions for the same criteria.",
    detail: "Before submission, the bot checks its internal execution state to ensure no subject is processed twice, saving network bandwidth and time."
  },
  {
    title: "Manual Captcha",
    icon: "🧩",
    description: "Integrated bridge for the critical IUSMS security step.",
    detail: "The bot pauses execution at the login stage, allowing you to solve the CAPTCHA in the terminal view or browser, then resumes automation immediately."
  },
  {
    title: "Core Architecture",
    icon: "🏗️",
    description: "Multi-tier engine design for maximum reliability.",
    detail: "Built with a modular internal structure that separates portal navigation, data injection, and logic validation, ensuring the system remains stable even if portal code changes."
  },
  {
    title: "Cloud Deployment",
    icon: "☁️",
    description: "Vercel-native optimization for high availability.",
    detail: "Optimized for serverless environments (Vercel/Next.js), enabling global access and rapid updates without local infrastructure dependencies."
  },
  {
    title: "Secure Uplink",
    icon: "🔒",
    description: "Encrypted credential handling and safe sessions.",
    detail: "Uses advanced encryption for local credential handling and secure session management to protect your IUSMS access tokens and personal data."
  }
];

export default function LandingPage() {
  const [mounted, setMounted] = useState(false);
  const [selectedFeature, setSelectedFeature] = useState<Feature | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
    
    // Intersection Observer for scroll-in animations
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('animate-fade-in');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1 });

    const animatedElements = document.querySelectorAll('.scroll-animate');
    animatedElements.forEach(el => observer.observe(el));

    return () => observer.disconnect();
  }, []);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>, index: number) => {
    const card = e.currentTarget;
    const rect = card.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    card.style.setProperty('--mouse-x', `${x}%`);
    card.style.setProperty('--mouse-y', `${y}%`);
  };

  if (!mounted) return null;

  return (
    <div className={styles.container} ref={containerRef}>
      <section className={`${styles.hero} scroll-animate`}>
        <div className={styles.botBadge}>
          <span className="animate-pulse" style={{ background: 'var(--primary)', boxShadow: '0 0 10px var(--primary)' }}></span> 
          <span>SYSTEM STATUS</span>
          <span style={{ color: 'var(--primary)' }}> : </span>
          <span>LAZY<span className={styles.dot}>.</span><span className={styles.dot}>.</span><span className={styles.dot}>.</span></span>
        </div>
        <h1 className={styles.title}>
          <span className={styles.titlePart1}>Automate Your</span> <br />
          <span className={styles.titlePart2}>IUSMS Feedback</span>
        </h1>
        <p className={styles.subtitle}>
          The smart automation engine for IUSMS feedback — fill forms 
          in under 5 minutes with speed, precision, and zero repetition.
        </p>
        
        <div className={styles.ctaWrapper}>
          <Link href="/op" className="btn-primary" style={{ padding: '1.2rem 3rem', fontSize: '1rem' }}>
            Fill Feedback
          </Link>
          <a href="#demo" className={styles.secondaryLink}>
            Systems Check
          </a>
        </div>
      </section>

      <section className={styles.featuresGrid}>
        {features.map((feature, idx) => (
          <div key={idx} className="scroll-animate" style={{ transitionDelay: `${idx * 0.1}s` }}>
            <ElectricBorder
              color="#ffffff" // White lightning
              speed={1.5}
              chaos={0.12}
              thickness={2}
              borderRadius={20}
              className={styles.featureCardWrapper}
            >
              <div 
                className={`${styles.featureCard} glass`}
                onMouseMove={(e) => handleMouseMove(e, idx)}
                onClick={() => setSelectedFeature(feature)}
              >
                <div className={styles.mouseLight}></div>
                <div className={styles.featureIcon}>{feature.icon}</div>
                <h3 className={styles.featureTitle}>{feature.title}</h3>
                <p className={styles.featureText}>{feature.description}</p>
              </div>
            </ElectricBorder>
          </div>
        ))}
      </section>

      <div style={{ width: '100%', maxWidth: '1000px', margin: '6rem auto 2rem' }}>
        <h2 className={styles.sectionTitle} style={{ textAlign: 'center', fontSize: '2.5rem' }}>System Clearance</h2>
        <p className={styles.subtext} style={{ textAlign: 'center' }}>(older gitbash version)</p>
      </div>

      <section id="demo" className={`${styles.howItWorks} scroll-animate`}>
        <div className={styles.videoContainer}>
          <iframe 
            src="https://drive.google.com/file/d/1n_JXNliyj0Nkn2cihvfX0Vd6b8CFk6yZ/preview" 
            allow="autoplay"
            title="Bot Demo Video"
          ></iframe>
        </div>
      </section>

      <footer className={styles.footer}>
        <p>&copy; {new Date().getFullYear()} FEEDBACK-BOT.V2. MISSION READY.</p>
        <p style={{ marginTop: '0.5rem', opacity: 0.5 }}>AUTONOMOUS FEEDBACK PROTOCOL ENABLED.</p>
      </footer>

      {/* Feature Detail Modal */}
      {selectedFeature && (
        <div className={styles.modalOverlay} onClick={() => setSelectedFeature(null)}>
          <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
            <button className={styles.closeBtn} onClick={() => setSelectedFeature(null)}>&times;</button>
            <div className={styles.featureIcon} style={{ fontSize: '3rem' }}>{selectedFeature.icon}</div>
            <h2 className={styles.modalTitle}>{selectedFeature.title}</h2>
            <p className={styles.modalText}>{selectedFeature.detail}</p>
            <div style={{ marginTop: '2rem' }}>
              <button className="btn-primary" onClick={() => setSelectedFeature(null)}>Acknowledge</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
