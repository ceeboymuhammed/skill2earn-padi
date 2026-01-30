// src/lib/skills.ts
export type SkillDef = {
  skill_code: string;
  skill_name: string;
  category: string;
  online_possible: boolean;
  physical_recommended: boolean;
  tags: Array<
    | "laptop_heavy"
    | "digital_creative"
    | "business_marketing"
    | "software_data"
    | "physical_trade"
    | "fast_income"
    | "slow_ramp"
  >;
};

export const MVP_SKILLS: SkillDef[] = [
  { skill_code: "AI01", skill_name: "AI Content Creation", category: "Business_Marketing", online_possible: true, physical_recommended: true, tags: ["business_marketing","fast_income"] },
  { skill_code: "AM01", skill_name: "Affiliate Marketing", category: "Business_Marketing", online_possible: true, physical_recommended: true, tags: ["business_marketing","slow_ramp"] },
  { skill_code: "DM01", skill_name: "Digital Marketing", category: "Business_Marketing", online_possible: true, physical_recommended: true, tags: ["business_marketing","fast_income"] },

  { skill_code: "GD01", skill_name: "Graphic Design", category: "Digital_Creative", online_possible: true, physical_recommended: true, tags: ["digital_creative","fast_income"] },
  { skill_code: "VE01", skill_name: "Video Editing", category: "Digital_Creative", online_possible: true, physical_recommended: true, tags: ["digital_creative","fast_income"] },
  { skill_code: "MG01", skill_name: "Motion Graphics", category: "Digital_Creative", online_possible: true, physical_recommended: true, tags: ["digital_creative","laptop_heavy","slow_ramp"] },
  { skill_code: "UX01", skill_name: "UI/UX Design", category: "Digital_Creative", online_possible: true, physical_recommended: true, tags: ["digital_creative","laptop_heavy","slow_ramp"] },

  { skill_code: "WD01", skill_name: "Full Stack Web Development", category: "Software_Development", online_possible: true, physical_recommended: true, tags: ["software_data","laptop_heavy","slow_ramp"] },
  { skill_code: "MD01", skill_name: "Mobile App Development (React Native)", category: "Software_Development", online_possible: true, physical_recommended: true, tags: ["software_data","laptop_heavy","slow_ramp"] },
  { skill_code: "DA01", skill_name: "Data Analytics (Excel/Power BI/SQL)", category: "Data_Analytics", online_possible: true, physical_recommended: true, tags: ["software_data","laptop_heavy","slow_ramp"] },

  { skill_code: "FT01", skill_name: "Tailoring / Fashion Design", category: "Fashion_Beauty", online_possible: true, physical_recommended: true, tags: ["physical_trade","fast_income"] },
  { skill_code: "WG01", skill_name: "Wig Making & Revamping", category: "Fashion_Beauty", online_possible: false, physical_recommended: true, tags: ["physical_trade","fast_income"] },
  { skill_code: "AD01", skill_name: "Adire Production", category: "Fashion_Beauty", online_possible: false, physical_recommended: true, tags: ["physical_trade","fast_income"] },

  { skill_code: "SI01", skill_name: "Solar & Inverter Installation", category: "Technical_Trades", online_possible: false, physical_recommended: true, tags: ["physical_trade","fast_income"] },
  { skill_code: "EI01", skill_name: "Electrical Installation", category: "Technical_Trades", online_possible: false, physical_recommended: true, tags: ["physical_trade","fast_income"] },
  { skill_code: "PR01", skill_name: "Mobile Phone Repairs", category: "Technical_Trades", online_possible: false, physical_recommended: true, tags: ["physical_trade","fast_income"] },
  { skill_code: "CT01", skill_name: "CCTV Installation", category: "Technical_Trades", online_possible: false, physical_recommended: true, tags: ["physical_trade","fast_income"] },
  { skill_code: "AC01", skill_name: "AutoCAD Design", category: "Technical_Trades", online_possible: true, physical_recommended: true, tags: ["laptop_heavy","slow_ramp"] },

  { skill_code: "CP01", skill_name: "Carpentry", category: "Technical_Trades", online_possible: false, physical_recommended: true, tags: ["physical_trade","fast_income"] },
  { skill_code: "BK01", skill_name: "Baking", category: "Technical_Trades", online_possible: false, physical_recommended: true, tags: ["physical_trade","fast_income"] },
];
