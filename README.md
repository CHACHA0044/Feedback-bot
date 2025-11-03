# Feedback-bot
# 🤖 Feedback Automation Bot

Tired of filling endless feedback forms? Let this bot do it for you automatically in less than 5 minutes!

📘 **Refer to [this link](https://drive.google.com/file/d/1QPbRvdQBOpQpqxqFi3j-PFBMJTQZOuet/view?usp=sharing)** to get a detailed understanding of how the bot works.

## ✨ Features

- ✅ Automated Theory Subject Feedback
- ✅ Automated Lab Feedback  
- ✅ Automated Mentor Feedback
- ✅ Automated Teaching & Learning Feedback
- ✅ Smart duplicate detection
- ✅ Skips already filled forms
- ✅ Detailed execution logs
- ✅ Error handling and recovery

## ⚠️ Limitations

- ❌ Dependent on the current IUSMS feedback form structure — if element names, IDs, or layout change, the bot will stop working  
- ❌ Works only for the subjects and teachers you provide — it won’t auto-detect new ones  
- ❌ Limited to the supported feedback types (Theory, Lab, Mentor, Teaching & Learning)  
- ❌ Requires a visible browser window and stable internet during execution


## 🚀 Quick Start

### Prerequisites

- Node.js (version 18 or higher)
- npm (comes with Node.js)

### Installation

1. **Clone this repository**
```bash
git clone https://github.com/CHACHA0044/Feedback-bot.git
cd Feedback-bot
```

2. **Install dependencies**
```bash
npm install
```

3. **Configure your credentials**

Open the `.env` file and fill in your details:
```env
# Your IUL SMS Credentials
ENROLLMENT_NO=your_enrollment_number
PASSWORD=your_password

# Theory subjects and teachers (comma-separated, must match in order)
THEORY_SUBJECTS=CS304,CS301,CS303
THEORY_TEACHERS=Teacher1,Teacher2,Teacher3

# Lab subjects and teachers
LAB_SUBJECTS=CS310,CS302
LAB_TEACHERS=Lab Teacher1,Lab Teacher2

# Mentor details
MENTOR_DEPT=Computer Science
MENTOR_NAME=Your Mentor Name

# Teaching & Learning subjects and teachers
TEACHING_SUBJECTS=CS304,CS301
TEACHING_TEACHERS=Teacher1,Teacher2

# Feedback option (Never/Rarely/Occasionally/Mostly/Always)
FEEDBACK_OPTION=Always

# Environment (keep as 'production')
ENVIRONMENT=production

Example env for CCAI B 3rd Yr students=
# IUSMS Credentials
ENROLLMENT_NO=your_enrollment_number
PASSWORD=your_password

# Theory subjects and teachers (comma-separated, must match in order)
THEORY_SUBJECTS=CS304,CS301,CS303,CS340,CS391,CS395,CG301
THEORY_TEACHERS=Mohammad Suaib,Tabassum,Roshan Jahan,Pervez Rauf,Saleyha Mariyam,Abhishek Pandey,Ayaz Mahmood

# Lab subjects and teachers (can have 2 teachers per lab)
LAB_SUBJECTS=CS310,CS302,CS393
LAB_TEACHERS=Nida Khan,Shaba Irram,Saman Khan

# Mentor details
MENTOR_DEPT=Computer Science
MENTOR_NAME=Tabassum

# Teaching & Learning subjects and teachers
TEACHING_SUBJECTS=CS304,CS301,CS303,CS340,CS391,CS395,CG301
TEACHING_TEACHERS=Mohammad Suaib,Tabassum,Roshan Jahan,Pervez Rauf,Saleyha Mariyam,Abhishek Pandey,Ayaz Mahmood

# Feedback option (Never/Rarely/Occasionally/Mostly/Always)
FEEDBACK_OPTION=Always

#Env keep 'production' only local testing depricated now
ENVIRONMENT=production
```

4. **Run the bot**
```bash
npm start
```

5. **Follow the prompts**
- Read the welcome message
- Type `Y` to start
- Sit back and relax!

## 📝 Important Notes

⚠️ **Security Warning**: 
- Never share your `.env` file with credentials
- After using the bot, you can delete the repository from your computer

⚠️ **During Execution**:
- Keep the browser window visible
- Don't interrupt the process
- Don't close the terminal

## 🎯 How It Works

1. Bot logs into IUSMS portal
2. Navigates to feedback sections
3. Fills forms based on your `.env` configuration
4. Automatically detects already submitted feedback
5. Provides detailed summary of all actions

## 🐛 Troubleshooting

**Bot fails to login:**
- Check your enrollment number and password
- Ensure you have internet connection
- Check for errors in logs

**Subject/Teacher not found:**
- Verify spelling in `.env` matches exactly with SMS portal
- Check for extra spaces

**Browser closes immediately:**
- Check console for error messages
- Ensure all required fields in `.env` are filled

## 📊 Sample Output
```
🤖 FEEDBACK AUTOMATION BOT
Tired of filling feedback forms manually?
Let this bot do it for you in less than 5 minutes!

🚀 Should I start filling your feedback? (Y/N): Y

✅ Starting feedback automation...
🔐 Logging in...
✅ Login successful!
📘 Processing Theory Feedback...
✅ Completed 5/5 theory subjects
...
🎉 All feedback submitted successfully!
```

## ⚖️ Disclaimer

This bot is for educational purposes. Users are responsible for:
- Keeping their credentials secure
- Using the bot responsibly
- No information is stored or sent anywhere
- Everything runs locally
- The bot doesn’t check your results, fees, or anything else — it only handles feedback forms
- Refer to index.js for more info

## 🤝 Contributing

Found a bug? Have a suggestion? Open an issue or submit a pull request!

## 📄 License

This project is licensed under the **GNU General Public License v3.0 (GPL-3.0)** — you are free to use, modify, and distribute this software under the same license terms.

---

Made this because it started as a fun idea I was discussing with my friends.
