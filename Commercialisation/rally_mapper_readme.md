# Rally Mapper 🏁

**Revolutionary Rally Navigation Platform for Professional and Amateur Rally Teams**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![React](https://img.shields.io/badge/React-18.0-blue.svg)](https://reactjs.org/)
[![PWA](https://img.shields.io/badge/PWA-Enabled-green.svg)](https://web.dev/progressive-web-apps/)
[![iPad Optimized](https://img.shields.io/badge/iPad-Optimized-orange.svg)](https://developer.apple.com/ipad/)

> Transform how rally teams capture, analyze, and utilize route data with cutting-edge web technologies and motorsport-specific workflows.

## 🚀 Live Demo

**[Try Rally Mapper](https://rallymapper.com)** *(Replace with your actual demo URL)*

## ✨ Key Features

### 🎯 **Real-Time GPS Navigation**
- **Sub-5-meter accuracy** maintained at rally speeds
- **One-handed operation** optimized for passenger seat use
- **Instant waypoint capture** with smart error recovery
- **Live GPS accuracy visualization** with color-coded indicators

### 🎤 **Advanced Voice Recognition**
- **Rally-specific natural language processing** understands motorsport terminology
- **Smart text correction** ("lift" → "left", "grade" → "grid")
- **Speed-contextual processing** adapts to vehicle speed
- **Hands-free operation** for safety during competition

### 📊 **Hierarchical Event Management**
- **Multi-day event support** with Day/Route/Stage organization
- **Professional naming conventions** (Day1/Route2/Stage3)
- **Data protection** with confirmation dialogs
- **Stage-specific waypoint collections**

### 🗺️ **Professional Map Integration**
- **Multiple map types** (Road, Satellite, Terrain, Hybrid)
- **GPS following modes** with manual override
- **Real-time route visualization** with dual polyline system
- **Interactive waypoint management** with detailed info windows

### 📤 **Universal Export Compatibility**
- **Enhanced JSON** with complete rally metadata
- **Rally Navigator GPX** with professional waypoint naming
- **Google Earth KML** for 3D route visualization
- **iPad-compatible export system** with multiple fallback methods

## 🛠️ Technology Stack

- **Frontend:** React 18 with modern hooks architecture
- **Maps:** Google Maps JavaScript API with rally-optimized rendering
- **Styling:** TailwindCSS with custom motorsport components
- **PWA:** Service Workers for offline capability
- **Voice:** Web Speech API with rally-specific processing
- **Export:** Multiple format support (GPX, KML, JSON)

## 🚀 Quick Start

### Prerequisites
- Node.js 16+ 
- npm or yarn
- Google Maps API key

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/rally-mapper.git
   cd rally-mapper
   ```

2. **Install dependencies**
   ```bash
   npm install
   # or
   yarn install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env.local
   ```
   
   Add your Google Maps API key to `.env.local`:
   ```
   REACT_APP_GOOGLE_MAPS_API_KEY=your_api_key_here
   ```

4. **Start development server**
   ```bash
   npm start
   # or
   yarn start
   ```

5. **Open browser**
   Navigate to `http://localhost:3000`

### Getting a Google Maps API Key

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable "Maps JavaScript API"
4. Create credentials (API Key)
5. Restrict the key to your domain for production

## 📱 Usage Guide

### Starting a Rally Stage

1. **Allow location permissions** when prompted
2. **Wait for GPS signal** (green status indicator)
3. **Enter route information** (Day, Route name, Stage)
4. **Click "Start Stage"** (green button)

### Adding Waypoints

**Manual Method:**
- Click **"📍 Add Waypoint"** button
- Edit waypoint name by clicking on it
- Add POI notes for additional context

**Voice Method:**
- Click **"🎤 Add Location"** button
- Speak your instruction (e.g., "Sharp left turn after cattle grid")
- System automatically processes and categorizes

### Voice Commands

**Global Commands** (available anytime):
- *"Stage Start"* - Begin new stage
- *"Stage End"* - Complete current stage
- *"Undo"* - Remove last waypoint

**Natural Waypoint Creation:**
- *"Left turn"* → Creates navigation waypoint
- *"Cattle grid"* → Creates obstacle waypoint  
- *"Danger washout"* → Creates safety waypoint
- *"Summit"* → Creates elevation waypoint

### Ending a Stage

1. **Click "End Stage"** (red button)
2. **Confirm export** in dialog
3. **Choose export method** (Share Sheet, Download, etc.)
4. **Files automatically generated** in multiple formats

## 🗂️ Export Formats

### Enhanced JSON
```json
{
  "metadata": {
    "routeName": "Day1-Route2",
    "stageName": "Day1/Route2/Stage3",
    "totalWaypoints": 15,
    "voiceWaypoints": 12
  },
  "waypoints": [
    {
      "name": "Sharp left turn",
      "coordinates": {"lat": -35.1234, "lon": 138.5678},
      "classification": {
        "category": "navigation",
        "rallyIcon": "left"
      }
    }
  ]
}
```

### Rally Navigator GPX
- Professional waypoint naming: `WP001: Sharp left turn`
- Rally-specific extensions with instruction text
- Voice creation indicators
- Speed context metadata

### Google Earth KML
- Folder-organized waypoints and tracks
- Rich description text with rally context
- GPS track visualization
- Waypoint numbering for reference

## 🎯 iPad Optimization

Rally Mapper is specifically designed for iPad use in rally vehicles:

- **Large touch targets** (minimum 44px) for gloved operation
- **High contrast interface** for outdoor visibility
- **One-handed operation** optimized for navigator position
- **Battery-optimized GPS polling** for all-day use
- **Offline-capable PWA** for remote rally locations

## 🏗️ Project Structure

```
rally-mapper/
├── public/
│   ├── manifest.json          # PWA configuration
│   └── RRM Logo 64x64.png     # App icon
├── src/
│   ├── components/
│   │   └── ReplayRoute.jsx    # Route replay functionality
│   ├── assets/
│   │   └── sounds/            # Voice feedback sounds
│   ├── App.jsx                # Main application component
│   ├── index.js               # React entry point
│   └── index.css              # Global styles
└── README.md
```

## 🤝 Contributing

We welcome contributions from the rally and development communities!

### Development Setup

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Add tests for new functionality
5. Commit changes (`git commit -m 'Add amazing feature'`)
6. Push to branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

### Contribution Guidelines

- Follow existing code style and conventions
- Add tests for new features
- Update documentation for API changes
- Test on iPad Safari before submitting
- Include rally-specific use cases in testing

## 🐛 Bug Reports & Feature Requests

**Found a bug?** Please check existing issues first, then create a new issue with:
- Rally Mapper version
- Device/browser information
- Steps to reproduce
- Expected vs actual behavior
- GPS accuracy at time of issue

**Have a feature idea?** We'd love to hear it! Please include:
- Use case description
- How it would improve rally navigation
- Priority level for your team/organization

## 📊 Roadmap

### Q4 2025
- [ ] **Advanced Analytics** - Route performance analysis
- [ ] **Waypoint Heatmaps** - Common hazard identification
- [ ] **Team Collaboration** - Real-time waypoint sharing
- [ ] **Voice Recognition Improvements** - Machine learning accuracy

### Q1 2026
- [ ] **AI-Powered Features** - Predictive waypoint suggestions
- [ ] **Route Optimization** - AI-suggested improvements
- [ ] **Safety Alerts** - Predictive hazard warnings
- [ ] **Advanced NLP** - Enhanced voice understanding

### Q2 2026
- [ ] **Hardware Integration** - OBD-II telemetry correlation
- [ ] **Action Camera Sync** - Automatic capture at waypoints
- [ ] **Intercom Integration** - Direct voice input from rally systems
- [ ] **Professional Timing** - Official rally timing integration

## 📜 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🏆 Acknowledgments

- **Rally Community** for testing and feedback in challenging conditions
- **Google Maps Platform** for reliable mapping services
- **React Team** for the excellent development framework
- **Rally Navigator** for export format inspiration
- **Professional Rally Teams** who provided real-world validation

## 📞 Contact & Support

- **Website:** [rallymapper.com](https://rallymapper.com)
- **Email:** support@rallymapper.com
- **GitHub Issues:** [Report bugs or request features](https://github.com/yourusername/rally-mapper/issues)
- **Discussions:** [Community discussions](https://github.com/yourusername/rally-mapper/discussions)

## ⭐ Show Your Support

If Rally Mapper helps your rally team, please consider:
- ⭐ **Starring this repository**
- 🐛 **Reporting bugs** you encounter
- 💡 **Suggesting features** for your use cases
- 🤝 **Contributing** to the codebase
- 📢 **Sharing** with other rally teams

---

**Built with ❤️ for the rally community by rally enthusiasts**

*Rally Mapper - Where precision meets performance in rally navigation*