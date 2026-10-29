# Prerequisites

The complete instructions are in README.md.

Required: Node.js 22+ with npm, MySQL Community Server 8.4, MongoDB Community Server 7+, and a desktop browser. Start both database servers locally before setup. Optional: MySQL Workbench, MongoDB Compass or mongosh.

The application dependencies are in package.json and package-lock.json. Install with npm ci. No pip requirements file, Redis, PostgreSQL, Docker or separate Express backend is required.

Default ports: Next.js 3000, MySQL 3306, MongoDB 27017. Configure local credentials in your private .env. The MySQL setup account needs database/table/view/trigger/routine creation privileges. Existing diagrams need no special software to view.

Only if regenerating diagrams: Python 3, Graphviz (dot command) and PyMuPDF. They are not needed to install/run the application.
