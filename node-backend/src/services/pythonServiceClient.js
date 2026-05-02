import axios from 'axios';
import config from '../config/index.js';
import logger from '../config/logger.js';

class PythonServiceClient {
  constructor() {
    this.baseURL = config.python_service_url;
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: config.request_timeout,
    });

    this.client.interceptors.request.use((requestConfig) => {
      // Independent traces - no context propagation
      // Python service will create its own span in Jaeger
      logger.debug('Calling Python service (independent trace)');
      return requestConfig;
    });

    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        logger.error(`Python Service Error: ${error.message}`, {
          endpoint: error.config?.url,
          method: error.config?.method,
          status: error.response?.status,
        });
        throw error;
      }
    );
  }

  async getProducts() {
    try {
      const response = await this.client.get('/api/v1/products');
      return response.data;
    } catch (error) {
      logger.error('Failed to fetch products from Python service', { error: error.message });
      throw new Error('Failed to fetch products');
    }
  }

  async getProductById(productId) {
    try {
      const response = await this.client.get(`/api/v1/products/${productId}`);
      return response.data;
    } catch (error) {
      if (error.response?.status === 404) {
        throw new Error('Product not found');
      }
      logger.error(`Failed to fetch product ${productId}`, { error: error.message });
      throw error;
    }
  }

  async createProduct(productData) {
    try {
      const response = await this.client.post('/api/v1/products', productData);
      return response.data;
    } catch (error) {
      logger.error('Failed to create product', { error: error.message });
      throw error;
    }
  }

  async updateProduct(productId, productData) {
    try {
      const response = await this.client.put(`/api/v1/products/${productId}`, productData);
      return response.data;
    } catch (error) {
      logger.error(`Failed to update product ${productId}`, { error: error.message });
      throw error;
    }
  }

  async deleteProduct(productId) {
    try {
      const response = await this.client.delete(`/api/v1/products/${productId}`);
      return response.data;
    } catch (error) {
      logger.error(`Failed to delete product ${productId}`, { error: error.message });
      throw error;
    }
  }

  async getOrders(userId) {
    try {
      const params = userId ? { user_id: userId } : {};
      const response = await this.client.get('/api/v1/orders', {
        params: params
      });
      return response.data;
    } catch (error) {
      logger.error('Failed to fetch orders', { error: error.message });
      throw error;
    }
  }

  async getOrderById(orderId) {
    try {
      const response = await this.client.get(`/api/v1/orders/${orderId}`);
      return response.data;
    } catch (error) {
      logger.error(`Failed to fetch order ${orderId}`, { error: error.message });
      throw error;
    }
  }

  async createOrder(orderData) {
    try {
      const response = await this.client.post('/api/v1/orders', orderData);
      return response.data;
    } catch (error) {
      logger.error('Failed to create order', { error: error.message });
      throw error;
    }
  }

  async updateOrder(orderId, orderData) {
    try {
      const response = await this.client.put(`/api/v1/orders/${orderId}`, orderData);
      return response.data;
    } catch (error) {
      logger.error(`Failed to update order ${orderId}`, { error: error.message });
      throw error;
    }
  }

  async checkServiceHealth() {
    try {
      const response = await this.client.get('/health');
      return response.data;
    } catch (error) {
      logger.error('Python service health check failed', { error: error.message });
      return { status: 'down', message: 'Python service unreachable' };
    }
  }

}

export default new PythonServiceClient();
