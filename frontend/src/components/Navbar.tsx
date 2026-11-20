"use client";

import Link from "next/link";
import styles from "./Navbar.module.css";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import TreeRootSwitcher, { PlatformType } from "./TreeRootSwitcher";

export default function Navbar() {
  const pathname = usePathname();
  const [platform, setPlatform] = useState<PlatformType>("iusms");

  useEffect(() => {
    if (pathname.startsWith("/ili")) {
      setPlatform("ili");
    } else {
      const saved = localStorage.getItem("feedback_bot_platform") as PlatformType;
      if (saved === "ili") {
        setPlatform("ili");
      } else {
        setPlatform("iusms");
      }
    }

    const handlePlatformChange = (e: any) => {
      if (e.detail) {
        setPlatform(e.detail);
      }
    };
    window.addEventListener("platform-change", handlePlatformChange);
    return () => window.removeEventListener("platform-change", handlePlatformChange);
  }, [pathname]);

  const isIli = platform === "ili";
  const baseHref = isIli ? "/ili" : "/";
  const opHref = isIli ? "/ili/op" : "/op";

  const isBaseActive = pathname === "/" || pathname === "/ili";
  const isOpActive = pathname.startsWith("/op") || pathname.startsWith("/ili/op");

  return (
    <nav className={styles.nav}>
      <Link href={baseHref} className={styles.logo}>
        <span className={`${styles.logoDot} ${isIli ? styles.iliLogoDot : ""}`}></span> 
        <span className={styles.fullText}>FEEDBACK</span>
        <span className={styles.shortText}>FB</span>
        <span className={`${styles.logoAlt} ${isIli ? styles.iliLogoAlt : ""}`}>
          {isIli ? "ILI" : "BOT"}
        </span>
      </Link>

      <div className={styles.rightCluster}>
        <div className={styles.links}>
          <Link 
            href={baseHref} 
            className={`${styles.link} ${isBaseActive ? styles.active : ""} ${isIli && isBaseActive ? styles.iliActive : ""}`}
          >
            Base
          </Link>
          <Link 
            href={opHref} 
            className={`${styles.link} ${isOpActive ? styles.active : ""} ${isIli && isOpActive ? styles.iliActive : ""}`}
          >
            Op
          </Link>
        </div>

        {/* Animated Tree Root Switcher */}
        <TreeRootSwitcher currentPlatform={platform} onPlatformChange={setPlatform} />
      </div>
    </nav>
  );
}
