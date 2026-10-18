import { database, ExcuseMessageCycle } from '@/database/database';
import { UserService } from './UserService';

export type ExcuseType =
  | 'Feeling Unmotivated / Tired'
  | 'Too Busy / Ran Out of Time'
  | 'Feeling Anxious'
  | 'Discouraged by Lack of Progress'
  | 'Too Sore / Need Recovery'
  | 'Sick / Injured'
  | 'Work Commitments'
  | 'Family / Social Plans'
  | 'Travelling'
  | 'Bad Weather'
  | 'Not Having a Gym Buddy'
  | 'Genuine Emergency';

interface MotivationalMessage {
  title: string;
  message: string;
}

export class ExcuseMessageService {
  // Simple test method to verify messages work without database
  static getTestMessage(excuseText: string): MotivationalMessage | null {
    const messages = this.MESSAGES[excuseText as ExcuseType];
    if (messages && messages.length > 0) {
      return messages[0]; // Return first message
    }
    return null;
  }

  private static readonly MESSAGES: Record<ExcuseType, MotivationalMessage[]> = {
    'Feeling Unmotivated / Tired': [
      {
        title: "The 10-Minute Deal",
        message: "I get it, the sofa has a strong gravitational pull today. But let's make a deal: just go for 10 minutes. If you still want to leave after that, you have my permission. Starting is the hardest part."
      },
      {
        title: "The Endorphin Argument",
        message: "Your brain is waiting for the good stuff. A workout is the fastest way to trigger a release of endorphins—your body's natural mood-boosters. You are one workout away from a better mood."
      },
      {
        title: "The Energy Equation",
        message: "It sounds crazy, but you have to spend energy to make energy. A study by the University of Georgia found that low-intensity exercise can decrease fatigue by 65%. The feeling of tiredness is the symptom, movement is the cure."
      },
      {
        title: "The Mental Health Stat",
        message: "Fact: Regular physical activity can reduce the risk of depression by up to 30%. Think of this workout not just as exercise for your body, but as crucial medicine for your mind."
      },
      {
        title: "The Momentum Message",
        message: "Greatness is built on the days you show up when you don't feel like it. Every workout you complete, especially on a tough day, builds a powerful chain of momentum. Don't break the chain today."
      }
    ],
    'Too Busy / Ran Out of Time': [
      {
        title: "The Dull Bot Warning",
        message: "Womp womp. All work and no play makes Jack a dull bot. Is your health the one thing you're willing to sacrifice today?"
      },
      {
        title: "The Cortisol Stat",
        message: "Consistently high stress from being \"too busy\" floods your body with the hormone cortisol, which is linked to weight gain and burnout. An hour in the gym is the best way to fight back."
      },
      {
        title: "The Productivity Investment",
        message: "This isn't lost time. Research shows exercise boosts concentration for hours afterwards. View this as an investment in making the rest of your day more efficient."
      },
      {
        title: "The Scalpel Approach",
        message: "No time for the full plan? Do a tactical strike. Get in, do your two most important exercises with focus, and get out. 30 minutes of sharp work is infinitely better than zero."
      },
      {
        title: "The Hard Question",
        message: "If your car's engine light came on, you'd make time for the mechanic. Your body is telling you it needs maintenance. Don't ignore the warning light."
      }
    ],
    'Feeling Anxious': [
      {
        title: "The Anxiolytic Effect",
        message: "Did you know that exercise is nature's most potent anti-anxiety medicine? The effects of a single workout can be felt immediately, reducing tension and improving mood."
      },
      {
        title: "The Headphone Shield",
        message: "Gym anxiety is real, but you have a superpower: your headphones. Put on your favourite playlist, turn up the volume, and make the world disappear. It's just you and the iron."
      },
      {
        title: "The Exposure Therapy",
        message: "The only way to beat this anxiety is to face it. Every time you walk into that gym, you are teaching your brain that you are safe, you are capable, and you belong there."
      },
      {
        title: "The Energy Reframe",
        message: "Anxiety is just misplaced energy. Let's give it a job. Channel that nervous energy into your first set and transform it into strength."
      },
      {
        title: "The One-Goal Mission",
        message: "Forget the whole plan. Your only mission today is to walk through the doors and do one single exercise. We count that as a massive win and build from there."
      }
    ],
    'Discouraged by Lack of Progress': [
      {
        title: "The Biology Snippet",
        message: "Visible muscle growth is a slow process, often taking 6-8 weeks of consistency to notice. You are in the foundational phase right now. Trust the process."
      },
      {
        title: "The Liar's Club",
        message: "The scale and the mirror can be liars. They don't show you that you're lifting 5kg more than last month or sleeping better. That's REAL progress."
      },
      {
        title: "The Plateau is a Trophy",
        message: "A plateau doesn't mean you've failed; it means you've succeeded so much that your body has adapted. Today isn't a setback, it's the start of the next level."
      },
      {
        title: "The Brick by Brick Analogy",
        message: "You can't see a wall being built by watching one brick being laid. Today's workout is just one brick. It's essential to the final structure. Let's go lay the brick."
      },
      {
        title: "Let's Look at the Data",
        message: "Forget feelings, let's look at facts. Open your logbook. On [Date], you [performed X]. Today, your plan is to [perform Y]. That is a measurable, undeniable improvement."
      }
    ],
    'Too Sore / Need Recovery': [
      {
        title: "The Active Recovery Mandate",
        message: "Womp womp. That soreness isn't a stop sign, it's a receipt for hard work. The best thing for it is light movement to increase blood flow. Motion is lotion."
      },
      {
        title: "The Compromise Plan",
        message: "No personal records today. The new mission: 10 minutes of walking on the treadmill, followed by 10 minutes of stretching. This is not skipping; this is strategic recovery."
      },
      {
        title: "The Warm-Up Test",
        message: "Get to the gym and just warm up. 5 minutes of light cardio. If the soreness turns into sharp pain, you can stop. 9 times out of 10, you'll feel better and ready to go."
      },
      {
        title: "Don't Let the Ache Win",
        message: "That ache is the feeling of growth. Don't let it teach your brain that hard work leads to a day off. Teach it that hard work is followed by smart recovery."
      },
      {
        title: "Redefine Today's 'Win'",
        message: "Today's victory isn't about lifting heavy. It's about being the kind of person who shows up even when they're sore. A 20-minute recovery session is a massive character win."
      }
    ],
    'Sick / Injured': [
      {
        title: "Rest Is Training Too",
        message: "If you're genuinely sick or hurt, staying home is the right call. Training through a fever or an injury costs you weeks, not one session. Rest, hydrate, and come back when your body says yes."
      },
      {
        title: "The Neck Check",
        message: "Old rule of thumb: symptoms above the neck (a runny nose) — a light session is usually fine. Below the neck (chest, fever, aches) — stay home. Be honest about which one this is."
      },
      {
        title: "Work Around It",
        message: "Injured wrist? Your legs still work. Bad knee? Upper body day. Most injuries rule out some training, not all of it. Only skip if it's the whole body saying no."
      }
    ],
    'Work Commitments': [
      {
        title: "The Meeting With Yourself",
        message: "You'd never skip a meeting with your boss. This workout is a meeting with the person who'll be living in your body in 20 years. Book it like it matters."
      },
      {
        title: "The Sharper Afternoon",
        message: "Exercise improves focus and working memory for hours afterwards. The deadline will still be there in an hour — and you'll hit it with a sharper brain."
      },
      {
        title: "The 20-Minute Version",
        message: "Can't do the full session? Do 20 minutes. A short workout keeps the habit alive, and the habit is the thing that actually gets results."
      }
    ],
    'Family / Social Plans': [
      {
        title: "Bring Them Along",
        message: "Could the plan include movement? A walk, a game, a bike ride. The best social plans are the ones that don't cost you your goals."
      },
      {
        title: "The Earlier Slot",
        message: "Plans in the evening? The gym is open now. Move the workout instead of deleting it."
      },
      {
        title: "Show Up For Them Longer",
        message: "Staying strong is how you keep showing up for the people you love — for decades, not just tonight. Fit the session in if you can."
      }
    ],
    'Travelling': [
      {
        title: "The Hotel Room Gym",
        message: "Push-ups, squats, lunges, planks. 20 minutes, zero equipment, any hotel room. Travel changes the venue, not the plan."
      },
      {
        title: "Walk The City",
        message: "New place? Explore it on foot. 10,000 steps of sightseeing is a workout your future self will thank you for."
      },
      {
        title: "Keep The Chain",
        message: "Travel is where habits go to die. One short session keeps the chain unbroken, and makes getting back on track at home far easier."
      }
    ],
    'Bad Weather': [
      {
        title: "The Controlled Environment",
        message: "It's raining? Good thing the gym has a roof. The weather is irrelevant to the progress you can make inside."
      },
      {
        title: "The Satisfaction Guarantee",
        message: "The workout you do on the day you least want to is the one that builds the most character. Imagine the satisfaction of knowing that while others stayed home, you won."
      },
      {
        title: "The Filter",
        message: "Days like today are a filter. They separate the people who are committed from those who are just interested. Which side are you on?"
      },
      {
        title: "You Are Not Made of Sugar",
        message: "It's just water. You have a coat. You will not melt. The iron is waiting."
      },
      {
        title: "The Elite Mentality",
        message: "Millions of people are using the weather as an excuse right now. The elite, the people who actually reach their goals—they aren't. This is your chance to act like them."
      }
    ],
    'Not Having a Gym Buddy': [
      {
        title: "Find Your Community",
        message: "Download the Meetup app and search for 'fitness', 'gym', or 'workout' groups in your area. Join 2-3 groups that match your fitness level and interests. Most groups welcome beginners and you'll find people with similar goals. Many cities have running clubs, hiking groups, CrossFit communities, or general fitness meetups. This is how you build your fitness family."
      }
    ],
    'Genuine Emergency': [
      {
        title: "Take Care",
        message: "Take care and come back stronger."
      }
    ]
  };

  /**
   * Get the next motivational message for a given excuse
   */
  static async getMotivationalMessage(
    excuseText: string,
    excuseType: 'medical' | 'emergency' | 'other'
  ): Promise<MotivationalMessage> {
    // Direct mapping - the excuseText is now the exact ExcuseType
    const excuseTypeKey = excuseText as ExcuseType;
    const messages = this.MESSAGES[excuseTypeKey];

    if (!messages || messages.length === 0) {
      throw new Error(`No messages found for excuse type: ${excuseTypeKey}`);
    }

    // Get current cycle position
    const cycle = await this.getMessageCycle(excuseTypeKey);
    const messageIndex = cycle ? cycle.last_message_index : 0;

    // Get the message
    const message = messages[messageIndex];

    // Update cycle for next time
    await this.updateMessageCycle(excuseTypeKey, messageIndex);

    return message;
  }

  /**
   * Get current message cycle for an excuse type
   */
  private static async getMessageCycle(excuseType: ExcuseType): Promise<ExcuseMessageCycle | null> {
    const db = await database.getDatabase();
    const user = await UserService.getCurrentUser();
    if (!user) return null;

    const cycle = await db.getFirstAsync<ExcuseMessageCycle>(
      'SELECT * FROM excuse_message_cycles WHERE user_id = ? AND message_category = ?',
      [user.id, excuseType]
    );

    return cycle || null;
  }

  /**
   * Update message cycle to next index
   */
  private static async updateMessageCycle(excuseType: ExcuseType, currentIndex: number): Promise<void> {
    const db = await database.getDatabase();
    const user = await UserService.getCurrentUser();
    if (!user) throw new Error('No user found');

    const messages = this.MESSAGES[excuseType];
    const nextIndex = (currentIndex + 1) % messages.length;
    const now = new Date().toISOString();

    // Try to update existing cycle
    const result = await db.runAsync(
      'UPDATE excuse_message_cycles SET last_message_index = ?, updated_at = ? WHERE user_id = ? AND message_category = ?',
      [nextIndex, now, user.id, excuseType]
    );

    // If no rows were updated, create new cycle
    if (result.changes === 0) {
      await db.runAsync(
        'INSERT INTO excuse_message_cycles (user_id, message_category, last_message_index, updated_at) VALUES (?, ?, ?, ?)',
        [user.id, excuseType, nextIndex, now]
      );
    }
  }

  /**
   * Reset message cycle for an excuse type (useful for testing)
   */
  static async resetMessageCycle(excuseType: ExcuseType): Promise<void> {
    const db = await database.getDatabase();
    const user = await UserService.getCurrentUser();
    if (!user) throw new Error('No user found');

    await db.runAsync(
      'UPDATE excuse_message_cycles SET last_message_index = 0, updated_at = ? WHERE user_id = ? AND message_category = ?',
      [new Date().toISOString(), user.id, excuseType]
    );
  }

  /**
   * Get all available excuse types
   */
  static getAvailableExcuseTypes(): ExcuseType[] {
    return Object.keys(this.MESSAGES) as ExcuseType[];
  }

  /**
   * Get message count for an excuse type
   */
  static getMessageCount(excuseType: ExcuseType): number {
    return this.MESSAGES[excuseType]?.length || 0;
  }
}