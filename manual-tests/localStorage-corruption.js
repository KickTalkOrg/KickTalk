/**
 * Test script to create corrupted localStorage data for migration testing
 * Run this in DevTools console to simulate different corruption scenarios
 */

// Scenario 1: Old data structure with user at wrong level (the main issue we encountered)
const corruptedScenario1 = [{
  id: 42857391,
  username: "testuser1337",
  displayName: "testuser1337",
  slug: "testuser1337",
  streamerData: {
    id: 91384562,
    user_id: 73294851,
    user: { username: "testuser1337" }
  },
  // ❌ CORRUPTED: user data at wrong level + stale emote count
  channel7TVEmotes: {
    user: { id: "02M847VX5P9NBQZKW3F2L4KG94" }, // Wrong location!
    emotes: new Array(35).fill(null).map((_, i) => ({
      id: `fake-emote-${i}`,
      name: `FakeEmote${i}`,
      platform: "7tv"
    })), // 35 fake emotes (stale data)
    emote_set: {
      id: "02M85B1HXZK06RBVQW7N9483MV",
      emotes: new Array(35).fill(null).map((_, i) => ({
        id: `fake-emote-${i}`,
        name: `FakeEmote${i}`
      }))
    }
  },
  order: 0
}];

// Scenario 2: Mixed corruption - some chatrooms good, some bad
const corruptedScenario2 = [
  {
    id: 58492673,
    username: "validstream99",
    displayName: "Valid Stream99",
    slug: "validstream99",
    streamerData: { 
      id: 27849163, 
      user_id: 91537284,
      user: { username: "validstream99" } // ✅ Add missing user object
    },
    // ✅ GOOD: Proper structure
    channel7TVEmotes: [
      {
        type: "global",
        emotes: [{ id: "global1", name: "GlobalEmote" }]
      },
      {
        type: "channel",
        user: { id: "03N952PY7Q1MBRZVX8K4L6FH02" }, // Correct location
        setInfo: { id: "03N959C2XJHD8STVP2Q5N7ME84" },
        emotes: [{ id: "chan1", name: "ChannelEmote" }]
      }
    ],
    order: 0
  },
  {
    id: 74829456,
    username: "brokentest42",
    displayName: "Broken Test42", 
    slug: "brokentest42",
    streamerData: { id: 83649572, user_id: 62840397 },
    // ❌ CORRUPTED: Old structure
    channel7TVEmotes: {
      user: { id: "04P736QW9R5NCGZLY2H8M1KT75" }, // Wrong location!
      emotes: [{ id: "old1", name: "OldEmote" }]
    },
    order: 1
  }
];

// Scenario 3: Completely missing emote data (edge case)
const corruptedScenario3 = [{
  id: 15736928,
  username: "noemotetests",
  displayName: "No Emote Tests",
  slug: "noemotetests", 
  streamerData: { id: 84729361, user_id: 59183472 },
  // ❌ CORRUPTED: Missing channel7TVEmotes entirely
  order: 0
}];

// Scenario 4: Partial corruption - some fields missing
const corruptedScenario4 = [{
  id: 93648257,
  username: "incompletechan",
  displayName: "Incomplete Chan",
  slug: "incompletechan",
  streamerData: { id: 62739485, user_id: 47582961 },
  // ❌ CORRUPTED: Has channel7TVEmotes but malformed
  channel7TVEmotes: [
    {
      type: "channel",
      // Missing user field entirely
      setInfo: { id: "05Q847TX9W6OHRVZL3M2N4KF83" },
      emotes: [{ id: "partial1", name: "PartialEmote" }]
    }
  ],
  order: 0
}];

// Helper functions to apply test scenarios
window.testCorruption = {
  // Apply scenario 1 (main corruption we encountered)
  applyScenario1() {
    localStorage.setItem('chatrooms', JSON.stringify(corruptedScenario1));
    localStorage.setItem('chatrooms_version', '1'); // Reset version to trigger migration
    console.log('✅ Applied Scenario 1: Old data structure with 35 fake emotes');
    console.log('Data:', corruptedScenario1);
  },

  // Apply scenario 2 (mixed good/bad data)  
  applyScenario2() {
    localStorage.setItem('chatrooms', JSON.stringify(corruptedScenario2));
    localStorage.setItem('chatrooms_version', '1'); // Reset version to trigger migration
    console.log('✅ Applied Scenario 2: Mixed corruption (1 good, 1 bad chatroom)');
    console.log('Data:', corruptedScenario2);
  },

  // Apply scenario 3 (missing emote data)
  applyScenario3() {
    localStorage.setItem('chatrooms', JSON.stringify(corruptedScenario3));
    localStorage.setItem('chatrooms_version', '1'); // Reset version to trigger migration
    console.log('✅ Applied Scenario 3: Missing channel7TVEmotes');
    console.log('Data:', corruptedScenario3);
  },

  // Apply scenario 4 (partial corruption)
  applyScenario4() {
    localStorage.setItem('chatrooms', JSON.stringify(corruptedScenario4));
    localStorage.setItem('chatrooms_version', '1'); // Reset version to trigger migration
    console.log('✅ Applied Scenario 4: Partial corruption (missing user field)');
    console.log('Data:', corruptedScenario4);
  },

  // Restore clean state
  clear() {
    localStorage.removeItem('chatrooms');
    console.log('✅ Cleared all chatroom data');
  },

  // Show current localStorage data
  show() {
    const data = JSON.parse(localStorage.getItem('chatrooms') || '[]');
    console.log('Current localStorage chatrooms:', data);
    return data;
  }
};

console.log('🧪 Test corruption scenarios loaded!');
console.log('Available commands:');
console.log('- testCorruption.applyScenario1() // Main corruption (35 fake emotes)');
console.log('- testCorruption.applyScenario2() // Mixed good/bad data');  
console.log('- testCorruption.applyScenario3() // Missing emote data');
console.log('- testCorruption.applyScenario4() // Partial corruption');
console.log('- testCorruption.clear() // Remove all data');
console.log('- testCorruption.show() // Show current data');