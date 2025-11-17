import "../assets/styles/main.scss";
import "../assets/styles/dialogs/Chatters.scss";
import "../../../../utils/themeUtils";

import React from "react";
import ReactDOM from "react-dom/client";
import Logs from "../components/Dialogs/Logs/index";
//import LogsProvider from "../providers/LogsProvider";

ReactDOM.createRoot(document.getElementById("root")).render(
<Logs />
);
