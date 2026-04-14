"use client";

import Link from "next/link";
import styles from "./Navbar.module.css";
import { usePathname } from "next/navigation";

export default function Navbar() {
  const pathname = usePathname();

  return (
    <nav className={styles.nav}>
      <Link href="/" className={styles.logo}>
        <span className={styles.logoDot}></span> 
        <span className={styles.fullText}>FEEDBACK</span>
        <span className={styles.shortText}>FB</span>
        <span className={styles.logoAlt}>BOT</span>
      </Link>
      <div className={styles.links}>
        <Link 
          href="/" 
          className={`${styles.link} ${pathname === '/' ? styles.active : ''}`}
        >
          Base
        </Link>
        <Link 
          href="/fill" 
          className={`${styles.link} ${pathname === '/fill' ? styles.active : ''}`}
        >
          Operation Page
        </Link>
      </div>
      <div className={styles.status}>
        <span className={styles.statusPulse}></span> UPLINK_SECURE
      </div>
    </nav>
  );
}
