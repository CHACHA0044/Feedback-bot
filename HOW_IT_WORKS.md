# ⚙️ How It Works  

Ever wondered how the Feedback Bot fills out all your IUSMS forms automatically?  
Here’s a quick breakdown of what happens behind the scenes 👇  

---

## 🧩 1. Setup  
- You fill in your **credentials** and other details in the `.env` file.  
- The bot reads your **subjects**, **teachers**, and **feedback categories** from the provided data.  

---

## 🌐 2. Launching the Bot  
- When you run the script, it launches a **browser window using Puppeteer**.  
- It then logs into **IUSMS** with your credentials automatically.  

---

## 📝 3. Navigating Feedback Forms  
- The bot opens each feedback form one by one (Theory, Lab, Mentor, Teaching & Learning).  
- It fills in ratings only — it’s not designed to write comments — based on pre-defined choices.  
- It scrolls to the **Submit** button and submits the form safely.  

---

## 🔁 4. Smart Automation  
- Detects and **skips already filled forms** to save time.  
- Handles small errors or delays gracefully using built-in **error recovery**.  
- Keeps track of every step in the **console logs** for easy debugging.  

---

## ✅ 5. Completion Summary  
- After finishing all forms, the bot displays a **summary of submissions** and skipped items.  
- You’ll know exactly which forms were filled successfully.  

---

## 🎥 6. Watch It in Action  
Want to see how it actually works?  
👉 [**Watch the demo video here**](https://drive.google.com/file/d/1QPbRvdQBOpQpqxqFi3j-PFBMJTQZOuet/view?usp=sharing)  

*(Click the link above to view the full walkthrough on Google Drive.)*    

---

## ⚠️ Note  
The bot only works while the IUSMS feedback structure remains unchanged.  
If the portal’s code or form structure changes, you may need to update element selectors in the script.  

---

Made this because it started as a fun idea I was discussing with my friends.  
