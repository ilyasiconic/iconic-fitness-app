import { Feather } from "@expo/vector-icons";
import { View } from "react-native";

import { AppText } from "@/components/AppText";
import { Card } from "@/components/Card";
import { ModalHeader } from "@/components/ModalHeader";
import { Screen } from "@/components/Screen";
import { useColors } from "@/hooks/useColors";

type Section = { heading: string; body: string | string[] };

// Keep this in sync with the website's /terms page (gymco InfoPage "terms").
const SECTIONS: Section[] = [
  {
    heading: "Acceptance",
    body: "By creating an Iconic Fitness account or using any Iconic Fitness facility, mobile application, or website (iconicfitnessindia.com), you agree to these Terms of Service and all policies incorporated by reference, including our Privacy Policy, Refund Policy, and Cookie Policy. If you do not agree, please do not create an account or use the service.",
  },
  {
    heading: "Eligibility",
    body: "You must be at least 16 years of age to create an account. Members aged 16–17 require written parental or guardian consent before purchasing a paid membership plan. Members under 13 are not permitted to use the service. By registering, you confirm that the information you provide is accurate and that you meet the age requirement.",
  },
  {
    heading: "Membership and subscriptions",
    body: [
      "Membership plans are valid for the duration stated at the time of purchase (e.g. 1 month, 3 months, 6 months, 12 months).",
      "Auto-renewal: Where a membership plan is set to renew automatically, your saved payment method will be charged at the then-current rate at the end of each billing period unless you cancel in advance. To cancel, contact us at iconicfitnessindia@gmail.com or WhatsApp +91 94800 00248 before your renewal date.",
      "Pricing may change with at least 30 days' advance notice sent to your registered email address.",
      "Plan benefits are subject to fair-use limits described in your chosen plan. Promotional offers cannot be combined unless Iconic Fitness expressly states otherwise.",
      "Facilities, amenities, class schedules, and operating hours vary by branch and may be updated by management without prior notice.",
      "Membership freezes, extensions, and special accommodations are subject to company policy and require management approval.",
    ],
  },
  {
    heading: "Membership transfer",
    body: [
      "Membership is intended for personal, non-commercial use by the registered member only.",
      "A membership may be transferred only to a new (non-existing) Iconic Fitness member — existing members are not eligible.",
      "Only the base membership may be transferred. Personal Training packages, diet plans, promotional benefits, add-on services, merchandise, and any other purchased packages are non-transferable.",
      "A minimum of 60 days of active membership validity must remain at the time the transfer request is submitted.",
      "The applicable membership transfer fee must be paid in full.",
      "All transfers are subject to management approval and identity verification.",
    ],
  },
  {
    heading: "No Refund Policy",
    body: [
      "All payments made for memberships, Personal Training, diet plans, merchandise, registration fees, transfer fees, or any other services at Iconic Fitness are strictly non-refundable.",
      "Once payment is completed, no refunds (full or partial) will be issued under any circumstances, including but not limited to: change of mind, relocation or travel, medical reasons, non-usage of services, schedule changes, personal reasons, or membership cancellation by the member.",
      "By completing payment, the member confirms that they have read, understood, and accepted these Terms & Conditions and the No Refund Policy.",
    ],
  },
  {
    heading: "Conduct and club rules",
    body: [
      "Members must follow all gym rules, safety guidelines, and staff instructions at every Iconic Fitness facility.",
      "Respect for staff and fellow members is mandatory. Harassment, discriminatory behaviour, or intimidation of any kind will result in immediate suspension or termination of membership without refund.",
      "Lockers are provided for temporary use during workouts only. Iconic Fitness is not responsible for the loss, theft, or damage of personal belongings.",
      "Any damage to gym equipment or property caused by negligence or misuse may be charged to the responsible member.",
      "Members are responsible for returning all equipment to its designated place after use and for maintaining hygiene standards (e.g. wiping down equipment).",
      "Members should consult a qualified medical practitioner before commencing any fitness programme, particularly if they have a pre-existing medical condition.",
    ],
  },
  {
    heading: "Liability and assumption of risk",
    body: "Physical exercise and use of gym equipment carry inherent risks including muscular strain, joint injuries, cardiovascular events, and in rare circumstances permanent disability or death. By using Iconic Fitness facilities or the app, you voluntarily assume all such risks. To the fullest extent permitted by applicable law, Iconic Fitness, its directors, employees, trainers, and partner gyms are not liable for any injury, illness, loss, or damage sustained during use of our facilities or services, except where such harm results from the proven gross negligence or wilful misconduct of Iconic Fitness.",
  },
  {
    heading: "Legal Waiver, Declaration & Indemnity",
    body: [
      "I declare that I am physically and mentally fit to participate in exercise and fitness activities. If I have any medical condition, illness, injury, or health concern, I will consult my doctor before participating.",
      "I understand that physical exercise, strength training, cardio workouts, group classes, and the use of gym equipment involve inherent risks that may result in injury, illness, permanent disability, or, in rare cases, death.",
      "I voluntarily participate in all activities at my own risk and accept full responsibility for any consequences arising from my participation.",
      "I agree to follow all safety instructions, gym rules, and directions given by Iconic Fitness staff and trainers.",
      "To the fullest extent permitted by applicable law, I release and discharge Iconic Fitness, its directors, shareholders, management, employees, trainers, agents, and affiliates from any claims arising from my use of the facilities or participation in any fitness activity, except where caused by the proven negligence or wilful misconduct of Iconic Fitness.",
      "I agree to indemnify and hold harmless Iconic Fitness from any third-party claims, liabilities, or expenses arising from my actions or violation of the gym's rules and policies.",
      "My payment and/or use of the Iconic Fitness App or facilities constitutes my electronic acceptance of this agreement and is legally binding to the extent permitted under applicable law.",
    ],
  },
  {
    heading: "Intellectual property",
    body: "All content on the Iconic Fitness app and website — including text, graphics, logos, class videos, workout plans, and software — is the property of Iconic Fitness India Pvt. Ltd. or its licensors and is protected under applicable Indian copyright and intellectual property laws. You may not reproduce, distribute, modify, or create derivative works from any content without our prior written consent.",
  },
  {
    heading: "Privacy",
    body: "We collect only what we need to run your membership. See the Privacy Policy for full details. We never sell your data to advertisers.",
  },
  {
    heading: "Digital Personal Data Protection Act 2023",
    body: [
      "Iconic Fitness processes your personal data as a 'Data Fiduciary' under the DPDP Act, 2023. We collect and process personal data only for lawful, specific, and stated purposes.",
      "As a Data Principal you have the right to: access a summary of your personal data; correct inaccurate data; request erasure where data is no longer necessary; and withdraw consent for non-essential data processing at any time.",
      "We will respond to all DPDP rights requests within the timelines prescribed under the Act.",
    ],
  },
  {
    heading: "Grievance Officer",
    body: "Name: Mohammed Suhail (CEO) · Address: Flat No. 43, Koramangala 1st Block, Bengaluru, Karnataka 560034 · Email: iconicfitnessindia@gmail.com · Phone: 070262 76888 · Hours: Mon–Sat, 9 AM – 6 PM IST. Grievances must be submitted in writing. We will acknowledge within 48 hours and resolve within 30 days.",
  },
  {
    heading: "Governing law",
    body: "These terms are governed by the laws of India, including the Information Technology Act 2000, the Consumer Protection Act 2019, and the Digital Personal Data Protection Act 2023. Any dispute shall be subject to the exclusive jurisdiction of the competent courts in Bengaluru, Karnataka, India.",
  },
  {
    heading: "Contact",
    body: "Questions about these terms? Email iconicfitnessindia@gmail.com or call 070262 76888 (Mon–Sat, 9 AM – 6 PM IST).",
  },
];

export default function TermsScreen() {
  const colors = useColors();
  return (
    <Screen>
      <ModalHeader title="Terms & Conditions" />
      <AppText
        size={13}
        style={{ color: colors.mutedForeground, marginBottom: 16 }}
      >
        Last updated · August 2026
      </AppText>
      <View style={{ gap: 12, paddingBottom: 24 }}>
        {SECTIONS.map((s) => (
          <Card key={s.heading} tone="elevated" style={{ gap: 8 }}>
            <AppText weight="700" size={15}>
              {s.heading}
            </AppText>
            {Array.isArray(s.body) ? (
              s.body.map((line, i) => (
                <View
                  key={i}
                  style={{ flexDirection: "row", gap: 8, alignItems: "flex-start" }}
                >
                  <Feather
                    name="check"
                    size={14}
                    color={colors.primary}
                    style={{ marginTop: 3 }}
                  />
                  <AppText
                    size={13}
                    style={{ color: colors.mutedForeground, flex: 1, lineHeight: 20 }}
                  >
                    {line}
                  </AppText>
                </View>
              ))
            ) : (
              <AppText
                size={13}
                style={{ color: colors.mutedForeground, lineHeight: 20 }}
              >
                {s.body}
              </AppText>
            )}
          </Card>
        ))}
      </View>
    </Screen>
  );
}
