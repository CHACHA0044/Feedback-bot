"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { usePathname, useRouter } from "next/navigation";
import styles from "./TreeRootSwitcher.module.css";

export type PlatformType = "iusms" | "ili";

interface TreeRootSwitcherProps {
  currentPlatform?: PlatformType;
  onPlatformChange?: (platform: PlatformType) => void;
}

export default function TreeRootSwitcher({ currentPlatform, onPlatformChange }: TreeRootSwitcherProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [platform, setPlatform] = useState<PlatformType>("iusms");
  const [mounted, setMounted] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const router = useRouter();

  // Detect platform from URL or localStorage
  useEffect(() => {
    setMounted(true);
    let detected: PlatformType = "iusms";
    if (pathname.startsWith("/ili")) {
      detected = "ili";
    } else {
      const saved = localStorage.getItem("feedback_bot_platform") as PlatformType;
      if (saved === "ili") {
        detected = "ili";
      }
    }
    setPlatform(detected);
    if (onPlatformChange) onPlatformChange(detected);
  }, [pathname, onPlatformChange]);

  // Click outside listener to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const selectPlatform = (target: PlatformType) => {
    setPlatform(target);
    localStorage.setItem("feedback_bot_platform", target);
    window.dispatchEvent(new CustomEvent("platform-change", { detail: target }));
    if (onPlatformChange) onPlatformChange(target);
    setIsOpen(false);

    // Route smoothly based on target
    if (target === "ili") {
      if (pathname === "/op") {
        router.push("/ili/op");
      } else if (pathname === "/") {
        router.push("/ili");
      } else if (!pathname.startsWith("/ili")) {
        router.push("/ili");
      }
    } else {
      if (pathname === "/ili/op") {
        router.push("/op");
      } else if (pathname === "/ili") {
        router.push("/");
      } else if (pathname.startsWith("/ili")) {
        router.push("/");
      }
    }
  };

  if (!mounted) return null;

  const isIli = platform === "ili";

  return (
    <div className={styles.treeContainer} ref={menuRef} style={{ position: "relative" }}>
      {/* Animated Tree Button */}
      <button
        type="button"
        className={`${styles.treeButton} ${isIli ? styles.iliActive : ""}`}
        onClick={() => setIsOpen(!isOpen)}
        title="Switch Platform Root (IUSMS / ILI Zone)"
        aria-label="Platform Root Switcher"
      >
        <div className={styles.iconWrapper}>
          {/* Animated SVG Tree Icon */}
          <svg
            viewBox="0 0 24 24"
            className={styles.treeSvg}
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* Trunk */}
            <motion.path
              d="M12 22V14M12 14L8 10M12 14L16 10M8 10L5 7M8 10L10 6M16 10L14 6M16 10L19 7"
              stroke={isIli ? "#c042b4" : "#f0c33c"}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: 0.8 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 1.5, repeat: Infinity, repeatType: "reverse" }}
            />
            {/* Canopy / Node Dots */}
            <circle cx="12" cy="4" r="2" fill={isIli ? "#e056d3" : "#ffdb66"} />
            <circle cx="5" cy="7" r="1.5" fill={isIli ? "#c042b4" : "#f0c33c"} />
            <circle cx="10" cy="6" r="1.5" fill={isIli ? "#c042b4" : "#f0c33c"} />
            <circle cx="14" cy="6" r="1.5" fill={isIli ? "#c042b4" : "#f0c33c"} />
            <circle cx="19" cy="7" r="1.5" fill={isIli ? "#c042b4" : "#f0c33c"} />
          </svg>
        </div>

        <div className={styles.rootLabel}>
          <span className={`${styles.activeDot} ${isIli ? styles.iliDot : ""}`} />
          <span>{isIli ? "ROOT: ILI" : "ROOT: IUSMS"}</span>
        </div>

        <span className={`${styles.arrow} ${isOpen ? styles.open : ""}`}>▼</span>
      </button>

      {/* Flyout Tree Branch Menu */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            className={styles.treeMenu}
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
          >
            <div className={styles.treeMenuHeader}>
              <span className={styles.headerTitle}>
                <span>🌱</span> PLATFORM ROOT MATRIX
              </span>
              <span style={{ fontSize: "0.6rem", color: isIli ? "#c042b4" : "#f0c33c" }}>
                ACTIVE: {platform.toUpperCase()}
              </span>
            </div>

            <div className={styles.rootTreeDiagram}>
              <div className={styles.treeTrunkLine} />

              <div className={styles.branchOptions}>
                {/* Branch 1: IUSMS */}
                <div
                  className={`${styles.branchCard} ${styles.iusmsCard} ${platform === "iusms" ? styles.active : ""}`}
                  onClick={() => selectPlatform("iusms")}
                >
                  <div className={styles.branchLeft}>
                    <div className={styles.branchIcon}>⚡</div>
                    <div className={styles.branchMeta}>
                      <span className={styles.branchName}>IUSMS PORTAL</span>
                      <span className={styles.branchDomain}>sms.iul.ac.in • Student Portal</span>
                    </div>
                  </div>
                  {platform === "iusms" && <span className={`${styles.branchTag} ${styles.activeBadge}`}>ACTIVE</span>}
                </div>

                {/* Branch 2: ILI Zone */}
                <div
                  className={`${styles.branchCard} ${styles.iliCard} ${platform === "ili" ? styles.active : ""}`}
                  onClick={() => selectPlatform("ili")}
                >
                  <div className={styles.branchLeft}>
                    <div className={styles.branchIcon}>🎓</div>
                    <div className={styles.branchMeta}>
                      <span className={styles.branchName}>ILI ZONE LMS</span>
                      <span className={styles.branchDomain}>ilizone.in • Moodle System</span>
                    </div>
                  </div>
                  {platform === "ili" && <span className={`${styles.branchTag} ${styles.activeBadge}`}>ACTIVE</span>}
                </div>
              </div>
            </div>

            <div className={styles.treeFooter}>
              Click any branch to pivot automation workspace &amp; pipelines.
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
