import React from "react";
import { NavLink, useNavigate } from "react-router-dom";
import "./HomePage.css";

const activity = [
  { value: "24", label: "Analyses", tone: "blue", icon: "scan" },
  { value: "17", label: "Healthy", tone: "green", icon: "leaf" },
  { value: "7", label: "Detected", tone: "red", icon: "alert" },
];

const recentAnalyses = [
  {
    image:
      "https://images.unsplash.com/photo-1592841200221-a6898f307baa?auto=format&fit=crop&w=300&q=85",
    crop: "Tomato Leaf",
    result: "Early Blight",
    confidence: "94.7%",
    date: "Today",
    risk: "High Risk",
    riskClass: "high",
  },
  {
    image:
      "https://images.unsplash.com/photo-1518977676601-b53f82aba655?auto=format&fit=crop&w=300&q=85",
    crop: "Tomato Leaf",
    result: "Healthy",
    confidence: "98.2%",
    date: "Yesterday",
    risk: "Healthy",
    riskClass: "healthy",
  },
  {
    image:
      "https://images.unsplash.com/photo-1518977676601-b53f82aba655?auto=format&fit=crop&w=300&q=85",
    crop: "Potato Leaf",
    result: "Late Blight",
    confidence: "91.4%",
    date: "Oct 6",
    risk: "Moderate Risk",
    riskClass: "moderate",
  },
];

function Icon({ name, size = 20 }) {
  const props = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
  };

  const icons = {
    home: (
      <>
        <path d="m3 10 9-7 9 7" />
        <path d="M5 9v11h14V9" />
        <path d="M9 20v-6h6v6" />
      </>
    ),
    camera: (
      <>
        <path d="M4 7h4l2-2h4l2 2h4v12H4z" />
        <circle cx="12" cy="13" r="3.2" />
      </>
    ),
    history: (
      <>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 7v5l3 2" />
        <path d="M4 5v4h4" />
      </>
    ),
    chat: (
      <>
        <path d="M4 5.5h16v11H9l-5 4v-15Z" />
        <path d="M8 10h.01M12 10h.01M16 10h.01" />
      </>
    ),
    user: (
      <>
        <circle cx="12" cy="8" r="3.2" />
        <path d="M5 20c.8-3.5 3.2-5 7-5s6.2 1.5 7 5" />
      </>
    ),
    bell: (
      <>
        <path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
        <path d="M10 21h4" />
      </>
    ),
    scan: 