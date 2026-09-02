import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { FieldReply } from "./ui/FieldReply";
import "./styles/desk.css";

const field = new URLSearchParams(window.location.search).get("field");

createRoot(document.getElementById("root")!).render(
  <StrictMode>{field ? <FieldReply /> : <App />}</StrictMode>,
);
