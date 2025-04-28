import axios from "axios";

const stvAPI = {
  getChannelEmotes: async (id) => {
    const response = await axios.get(`https://7tv.io/v3/emote-sets/${id}`);
    return response.data;
  },
  getGlobalEmotes: async () => {
    const response = await axios.get(`https://7tv.io/v3/emote-sets/global`);
    return response.data;
  },
  getUserCosmetics: async (id) => {
    const response = await axios.get(`https://7tv.io/v3/users/kick/${id}`);
    return response.data;
  },
};

export default stvAPI;
